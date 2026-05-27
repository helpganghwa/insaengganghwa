/**
 * PROFILE §2 핵심 흐름 — Pixellab v2 큐 등록 + 폴링 + 8방향 다운로드 + Supabase
 * Storage 미러링 + Claude vision 자동 검토 + 분기(accepted/rejected_ai/failed).
 *
 * cron(`/api/cron/profile-poll`)에서 호출:
 *  - enqueueOnePixellab(): status='queued' 1건 → Pixellab v2 POST → 'downloading'
 *  - pollAndProcessDownloading(): status='downloading' N건 → 폴링 → 완료시 process
 *
 * 외부 의존:
 *  - Pixellab v2 API (PIXELLAB_API_KEY)
 *  - Supabase Storage bucket `profiles` (public, 사용자 수동 생성)
 *  - Claude Haiku 4.5 vision (ANTHROPIC_API_KEY) — ai-review.ts
 */
import 'server-only';

import sharp from 'sharp';
import { and, eq, sql } from 'drizzle-orm';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { db } from '@/lib/db/client';
import { profileGenerationJobs, userProfiles } from '@/lib/db/schema/avatar';
import { mailbox } from '@/lib/db/schema/mailbox';
import { profiles } from '@/lib/db/schema/profiles';

import { reviewProfile, type ReviewVerdict } from './ai-review';
import { pickRefs } from './refs';

/**
 * Storage write·read는 service_role 클라이언트 사용. cron/script context엔
 * Next request scope(cookies)가 없으므로 `createSupabaseServerClient()` 사용 불가.
 * RLS 우회 + cookies 의존 X.
 */
let _serviceClient: SupabaseClient | null = null;
function serviceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE service env missing');
  _serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serviceClient;
}

// ─── 상수 ───

const PIXELLAB_BASE = 'https://api.pixellab.ai/v2';
const STORAGE_BUCKET = 'profiles';

const DIRECTIONS = [
  'south',
  'east',
  'north',
  'west',
  'south-east',
  'north-east',
  'north-west',
  'south-west',
] as const;
type Direction = (typeof DIRECTIONS)[number];

/** Storage path → DB rotations jsonb 키 (DB enum은 snake_case). */
function dirKey(d: Direction): string {
  return d.replace('-', '_');
}

interface PixellabCreateResponse {
  character_id: string;
  background_job_id: string;
  status: 'processing' | 'completed' | 'failed';
}

interface PixellabBackgroundJob {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  last_response?: { character_id?: string; [k: string]: unknown } | null;
}

interface PixellabCharacterDetail {
  id: string;
  rotation_urls: Record<string, string | null>;
}

// ─── 1. 큐 등록 — status='queued' 1건 → Pixellab POST → 'downloading' ───

export async function enqueueOnePixellab(): Promise<
  | { kind: 'noop' }
  | { kind: 'enqueued'; jobId: bigint; characterId: string }
  | { kind: 'failed'; jobId: bigint; reason: string }
> {
  const key = process.env.PIXELLAB_API_KEY;
  if (!key) throw new Error('PIXELLAB_API_KEY missing');

  // 1건 선점 (FIFO).
  const [job] = await db
    .select({
      id: profileGenerationJobs.id,
      userId: profileGenerationJobs.userId,
      description: profileGenerationJobs.descriptionPrompt,
      options: profileGenerationJobs.options,
    })
    .from(profileGenerationJobs)
    .where(eq(profileGenerationJobs.status, 'queued'))
    .orderBy(profileGenerationJobs.createdAt)
    .limit(1);

  if (!job) return { kind: 'noop' };

  // ref 로드 + spec 사이즈로 sharp resize (nearest-neighbor 픽셀결 유지).
  // concept_image max 1024×1024, reference_image max 168×168 (Pixellab v2 spec).
  // ref 파일 원본은 더 큰 사이즈 — runtime에 resize.
  const optsTyped = job.options as { gender: 'male' | 'female' };
  const refPair = pickRefs({ gender: optsTyped.gender });
  const [conceptBuf, referenceBuf] = await Promise.all([
    sharp(refPair.conceptPath)
      .trim({ background: { r: 255, g: 255, b: 255, alpha: 1 }, threshold: 10 })
      .resize(512, 512, {
        fit: 'contain',
        kernel: sharp.kernel.nearest,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toBuffer(),
    sharp(refPair.referencePath)
      .trim({ background: { r: 255, g: 255, b: 255, alpha: 1 }, threshold: 10 })
      .resize(168, 168, {
        fit: 'contain',
        kernel: sharp.kernel.nearest,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toBuffer(),
  ]);

  // Pixellab v2 호출 — PROFILE §4.1 검증 파라미터.
  const body = {
    description: job.description,
    image_size: { width: 168, height: 168 },
    method: 'create_from_concept',
    view: 'low top-down',
    template_id: 'mannequin',
    concept_image: { type: 'base64', base64: conceptBuf.toString('base64'), format: 'png' },
    reference_image: {
      type: 'base64',
      base64: referenceBuf.toString('base64'),
      format: 'png',
    },
    no_background: true,
  };

  const res = await fetch(`${PIXELLAB_BASE}/create-character-pro`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    await markFailedAndRefund(job.id, job.userId, `Pixellab POST HTTP ${res.status}: ${text}`);
    return { kind: 'failed', jobId: job.id, reason: text };
  }

  const json = (await res.json()) as PixellabCreateResponse;

  await db
    .update(profileGenerationJobs)
    .set({
      status: 'downloading',
      pixellabCharacterId: json.character_id,
      pixellabBackgroundJobId: json.background_job_id,
    })
    .where(eq(profileGenerationJobs.id, job.id));

  return { kind: 'enqueued', jobId: job.id, characterId: json.character_id };
}

// ─── 2. 폴링 + 처리 — status='downloading' N건 ───

export async function pollAndProcessDownloading(limit = 5): Promise<{
  polled: number;
  accepted: number;
  rejected: number;
  failed: number;
  stillProcessing: number;
}> {
  const key = process.env.PIXELLAB_API_KEY;
  if (!key) throw new Error('PIXELLAB_API_KEY missing');

  const due = await db
    .select({
      id: profileGenerationJobs.id,
      userId: profileGenerationJobs.userId,
      characterId: profileGenerationJobs.pixellabCharacterId,
      backgroundJobId: profileGenerationJobs.pixellabBackgroundJobId,
      description: profileGenerationJobs.descriptionPrompt,
      options: profileGenerationJobs.options,
      equipmentSnapshot: profileGenerationJobs.equipmentSnapshot,
      diamondEscrow: profileGenerationJobs.diamondEscrow,
    })
    .from(profileGenerationJobs)
    .where(eq(profileGenerationJobs.status, 'downloading'))
    .orderBy(profileGenerationJobs.createdAt)
    .limit(limit);

  let accepted = 0;
  let rejected = 0;
  let failed = 0;
  let stillProcessing = 0;

  for (const job of due) {
    if (!job.characterId || !job.backgroundJobId) {
      await markFailedAndRefund(job.id, job.userId, 'Pixellab ids missing');
      failed += 1;
      continue;
    }

    // 1) background job status polling (v2 spec: status가 여기 있음).
    const bgRes = await fetch(`${PIXELLAB_BASE}/background-jobs/${job.backgroundJobId}`, {
      headers: { authorization: `Bearer ${key}` },
    });
    if (!bgRes.ok) {
      stillProcessing += 1;
      continue;
    }
    const bgJob = (await bgRes.json()) as PixellabBackgroundJob;

    if (bgJob.status === 'processing') {
      stillProcessing += 1;
      continue;
    }
    if (bgJob.status === 'failed') {
      const detail = JSON.stringify(bgJob.last_response ?? {}).slice(0, 300);
      await markFailedAndRefund(job.id, job.userId, `Pixellab job failed: ${detail}`);
      failed += 1;
      continue;
    }

    // 2) completed — character GET으로 rotation_urls 가져옴.
    const charRes = await fetch(`${PIXELLAB_BASE}/characters/${job.characterId}`, {
      headers: { authorization: `Bearer ${key}` },
    });
    if (!charRes.ok) {
      stillProcessing += 1;
      continue;
    }
    const char = (await charRes.json()) as PixellabCharacterDetail;
    if (!char.rotation_urls) {
      await markFailedAndRefund(job.id, job.userId, 'Pixellab character rotation_urls missing');
      failed += 1;
      continue;
    }
    // rotation_urls의 string|null을 filter — 8방향 풀시트라 다 string이어야.
    const remoteRotations: Record<string, string> = {};
    for (const [k, v] of Object.entries(char.rotation_urls)) {
      if (typeof v === 'string') remoteRotations[k] = v;
    }

    try {
      const rotations = await mirrorRotations(job.characterId, remoteRotations, job.userId);
      const southUrl = rotations[dirKey('south')];
      if (!southUrl) throw new Error('south rotation missing after mirror');

      // south.png를 fetch해서 Claude review로 — Supabase public URL 활용.
      const southRes = await fetch(southUrl);
      if (!southRes.ok) throw new Error(`south fetch HTTP ${southRes.status}`);
      const southBuf = Buffer.from(await southRes.arrayBuffer());

      const review = await reviewProfile({
        imagePng: southBuf,
        descriptionPrompt: job.description,
      });

      if (review.verdict.pass) {
        await acceptJob(job.id, job.userId, rotations, job.characterId, job.options, job.equipmentSnapshot, job.description, review.verdict);
        accepted += 1;
      } else {
        await rejectJob(job.id, job.userId, job.diamondEscrow, review.verdict);
        rejected += 1;
      }
    } catch (e) {
      // Storage·Review 실패 — transient 가능성이라 status 유지 (다음 iteration에 재시도).
      // 다만 너무 많은 재시도는 별도 처리 필요 (v1 단순).
      console.error(`[profile-poll] job ${job.id} processing error:`, (e as Error).message);
      stillProcessing += 1;
    }
  }

  return { polled: due.length, accepted, rejected, failed, stillProcessing };
}

// ─── helpers ───

async function mirrorRotations(
  characterId: string,
  remoteRotations: Record<string, string>,
  userId: string,
): Promise<Record<string, string>> {
  const supabase = serviceClient();
  const result: Record<string, string> = {};

  for (const dir of DIRECTIONS) {
    const remoteUrl = remoteRotations[dir];
    if (!remoteUrl) continue;
    const r = await fetch(remoteUrl);
    if (!r.ok) throw new Error(`fetch rotation ${dir} HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const path = `${userId}/${characterId}/${dir}.png`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, buf, {
      contentType: 'image/png',
      upsert: true,
    });
    if (error) throw new Error(`storage upload ${dir}: ${error.message}`);
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    result[dirKey(dir)] = data.publicUrl;
  }
  return result;
}

async function acceptJob(
  jobId: bigint,
  userId: string,
  rotations: Record<string, string>,
  characterId: string,
  options: unknown,
  equipmentSnapshot: unknown,
  descriptionPrompt: string,
  verdict: ReviewVerdict,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [profile] = await tx
      .insert(userProfiles)
      .values({
        userId,
        rotations,
        activeDirection: 'south',
        pixellabCharacterId: characterId,
        options,
        equipmentSnapshot,
        descriptionPrompt,
      })
      .returning({ id: userProfiles.id });

    await tx
      .update(profileGenerationJobs)
      .set({
        status: 'accepted',
        aiVerdict: verdict,
        userProfileId: profile!.id,
        resolvedAt: sql`now()`,
      })
      .where(eq(profileGenerationJobs.id, jobId));

    // 첫 프로필이면 자동 active.
    await tx
      .update(profiles)
      .set({ activeProfileId: profile!.id })
      .where(and(eq(profiles.id, userId), sql`${profiles.activeProfileId} IS NULL`));

    await tx.insert(mailbox).values({
      userId,
      type: 'profile_accepted',
      title: '프로필 생성 완료',
      body: '새 프로필이 목록에 추가되었습니다. 상세 화면에서 8방향을 둘러보세요.',
      senderLabel: '시스템',
      payload: {},
    });
  });
}

async function rejectJob(
  jobId: bigint,
  userId: string,
  escrow: bigint,
  verdict: ReviewVerdict,
): Promise<void> {
  const reasonsKr = verdict.reasons.length > 0 ? verdict.reasons.join(', ') : 'unspecified';
  const notes = verdict.notes || '검토 기준에 부합하지 않습니다.';
  await db.transaction(async (tx) => {
    await tx
      .update(profiles)
      .set({ diamond: sql`${profiles.diamond} + ${escrow}` })
      .where(eq(profiles.id, userId));

    await tx
      .update(profileGenerationJobs)
      .set({
        status: 'rejected_ai',
        aiVerdict: verdict,
        rejectReason: notes,
        resolvedAt: sql`now()`,
      })
      .where(eq(profileGenerationJobs.id, jobId));

    await tx.insert(mailbox).values({
      userId,
      type: 'profile_rejected_ai',
      title: '프로필 검토 미통과',
      body: `사유(${reasonsKr}): ${notes}\n\n다이아는 전액 환불되었습니다.`,
      senderLabel: '시스템',
      payload: {},
    });
  });
}

async function markFailedAndRefund(jobId: bigint, userId: string, reason: string): Promise<void> {
  // 작업 정보 조회.
  const [job] = await db
    .select({ escrow: profileGenerationJobs.diamondEscrow, status: profileGenerationJobs.status })
    .from(profileGenerationJobs)
    .where(eq(profileGenerationJobs.id, jobId));
  if (!job || job.status === 'failed' || job.status === 'rejected_ai' || job.status === 'accepted') return;

  await db.transaction(async (tx) => {
    await tx
      .update(profiles)
      .set({ diamond: sql`${profiles.diamond} + ${job.escrow}` })
      .where(eq(profiles.id, userId));

    await tx
      .update(profileGenerationJobs)
      .set({
        status: 'failed',
        rejectReason: reason.slice(0, 500),
        resolvedAt: sql`now()`,
      })
      .where(eq(profileGenerationJobs.id, jobId));

    await tx.insert(mailbox).values({
      userId,
      type: 'profile_failed',
      title: '프로필 생성 시스템 오류',
      body: `생성 도중 시스템 오류가 발생해 다이아가 전액 환불되었습니다.\n다시 시도해 주세요.\n\n(내부 사유: ${reason.slice(0, 200)})`,
      senderLabel: '시스템',
      payload: {},
    });
  });
}
