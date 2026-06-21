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

import { and, eq, sql } from 'drizzle-orm';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { walletAdd } from '@/lib/game/wallet';
import { profileGenerationJobs, userProfiles } from '@/lib/db/schema/avatar';
import { mailbox } from '@/lib/db/schema/mailbox';

import { sendPushToUser } from '@/lib/push/send';

import { reviewProfile, type ReviewVerdict } from './ai-review';
import { anyBackgroundOpaque } from './bg-alpha';

/** 검토 결과 push — 실패는 무시(전체 흐름 막지 않음). 토글·구독은 sendPushToUser가 처리. */
async function safePush(
  userId: string,
  title: string,
  body: string,
  url = '/me',
): Promise<void> {
  try {
    await sendPushToUser(userId, { category: 'profile', title, body, url, tag: 'profile' });
  } catch (e) {
    console.error('[profile-poll] push failed:', (e as Error).message);
  }
}

/**
 * 사용자 본인이 pixellab 웹에서 만든·만족 검증한 source character 2장 (2026-05-27 결정).
 * `create_character_state`로 이 두 source에 edit_description을 적용해 새 캐릭터 파생 —
 * 풀바디·아니메 결·체형·사이즈(248×248px) 모두 source 보존. 다양성은 edit_description의
 * 머리·표정·포즈·장비 모티프 조합으로.
 */
const SOURCE_BY_GENDER: Record<'male' | 'female', string> = {
  // 2026-05-29 — source 교체.
  male: '49f210db-1899-4df0-8b2e-bb09537ed7c6',
  female: 'fa5ff0de-1ab2-4dcf-b1a9-80a08f86f67b',
};

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

/**
 * downloading 상태 상한(분). createdAt 기준. pixellab pro 평균 ~6분, 큐 지연 포함 여유.
 * 초과 시 rotation 완성 여부와 무관하게 fail+환불 — rotation_urls는 떴지만 실제 파일이
 * 영원히 404인 부분 실패(검증된 케이스)까지 잡기 위해 length 조건과 분리.
 */
const PROFILE_GEN_TIMEOUT_MIN = 20;

/** PNG 매직 넘버(89 50 4E 47) 검증 — pixellab이 404 JSON/빈 파일을 줄 때 깨진 업로드 방지. */
function isPng(buf: Buffer): boolean {
  return (
    buf.length >= 67 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

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

  // 1건 선점 (FIFO). state edit_description은 descriptionPrompt에 저장.
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

  // 2026-05-27 결정: create_character_state로 사용자 검증 source 활용.
  // source = 사용자 본인이 web에서 만든 만족 캐릭터 (gender별 1장). edit_description으로
  // 머리·표정·포즈·장비 모티프 변형 — source 톤·풀바디·체형 그대로 유지.
  const optsTyped = job.options as { gender: 'male' | 'female' };
  const sourceCharacterId = SOURCE_BY_GENDER[optsTyped.gender];

  // Pixellab spec: edit_description ≤ 1000자. compose가 보장하지만, 과거 저장분·예외 경로
  // 대비 요청 직전 최종 하드컷(단어경계) — 절대 1000 초과로 요청하지 않음.
  let editDescription = job.description;
  if (editDescription.length > 1000) {
    const cut = editDescription.slice(0, 1000);
    editDescription = cut.slice(0, Math.max(1, cut.lastIndexOf(' '))).trimEnd();
    console.warn(
      `[profile-enqueue] job ${job.id} edit_description ${job.description.length}>1000 → ${editDescription.length}자로 절단 후 요청`,
    );
  }

  const body = {
    character_id: sourceCharacterId,
    edit_description: editDescription,
    no_background: true,
    // use_color_palette_from_reference: true 실험 결과 — 소스 캐릭터 팔레트/디자인을 통째로
    // 덮어써 의도한 장비 색을 무시(2026-06-19). 회전 색 드리프트도 못 고침 → false 유지.
    use_color_palette_from_reference: false,
  };

  const res = await fetch(`${PIXELLAB_BASE}/create-character-state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    await markFailedAndRefund(job.id, job.userId, `Pixellab state POST HTTP ${res.status}: ${text}`);
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
      serverId: profileGenerationJobs.serverId,
      createdAt: profileGenerationJobs.createdAt,
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
    if (!job.characterId) {
      await markFailedAndRefund(job.id, job.userId, 'Pixellab character_id missing');
      failed += 1;
      continue;
    }

    // character endpoint로 polling — rotation_urls 완성도가 완료 신호.
    // (background-jobs는 만료/404 가능, v2 character 응답엔 status 필드 없음 —
    //  rotation_urls의 string 갯수 8이면 completed, 미만이면 pending.)
    const charRes = await fetch(`${PIXELLAB_BASE}/characters/${job.characterId}`, {
      headers: { authorization: `Bearer ${key}` },
    });
    if (!charRes.ok) {
      if (charRes.status === 404) {
        await markFailedAndRefund(job.id, job.userId, `Pixellab character not found (${charRes.status})`);
        failed += 1;
      } else {
        stillProcessing += 1;
      }
      continue;
    }
    const char = (await charRes.json()) as PixellabCharacterDetail;

    // Timeout 가드 (rotation 완성 여부와 무관 — 맨 앞). rotation_urls는 떴지만 실제 파일이
    // 영원히 404인 부분 실패(검증됨)까지 포함해 무한 재시도·큐 영구 점유를 차단.
    const ageMin = (Date.now() - new Date(job.createdAt ?? 0).getTime()) / 60_000;
    if (ageMin > PROFILE_GEN_TIMEOUT_MIN) {
      await markFailedAndRefund(job.id, job.userId, `Pixellab timeout/stall ${ageMin.toFixed(0)}min`);
      failed += 1;
      continue;
    }

    if (!char.rotation_urls) {
      stillProcessing += 1;
      continue;
    }
    // rotation_urls의 string|null 필터. 8방향 다 string이어야 completed.
    const remoteRotations: Record<string, string> = {};
    for (const [k, v] of Object.entries(char.rotation_urls)) {
      if (typeof v === 'string' && v.length > 0) remoteRotations[k] = v;
    }
    if (Object.keys(remoteRotations).length < 8) {
      stillProcessing += 1;
      continue;
    }

    try {
      const rotations = await mirrorRotations(job.characterId, remoteRotations, job.userId);
      const rotEntries = Object.entries(rotations);
      if (rotEntries.length === 0) throw new Error('no rotations after mirror');

      // 8방향 전부 fetch(병렬) → 멀티 이미지 검토(측면/후면의 신체 개수 결함도 검출).
      const images = await Promise.all(
        rotEntries.map(async ([direction, url]) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`rotation ${direction} fetch HTTP ${res.status}`);
          return { direction, png: Buffer.from(await res.arrayBuffer()) };
        }),
      );

      const review = await reviewProfile({
        images,
        descriptionPrompt: job.description,
      });

      // 배경 투명 검사(결정론) — no_background 실패(불투명 배경)는 AI 비전이 못 잡으므로 alpha로 선차단.
      // 통과해도 불투명이면 quality reject(환불) — 유저에게 배경 깔린 아바타 전달 방지.
      const bgOpaque = await anyBackgroundOpaque(images.map((im) => im.png));

      if (review.verdict.pass && !bgOpaque) {
        await acceptJob(job.id, job.serverId, job.userId, rotations, job.characterId, job.options, job.equipmentSnapshot, job.description, review.verdict);
        accepted += 1;
      } else {
        const verdict = bgOpaque
          ? { ...review.verdict, pass: false, reasons: [...new Set([...review.verdict.reasons, 'quality' as const])], notes: review.verdict.notes || '배경이 투명하지 않습니다(불투명 배경 검출).' }
          : review.verdict;
        await rejectJob(job.id, job.userId, job.serverId, job.diamondEscrow, verdict);
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
    const raw = Buffer.from(await r.arrayBuffer());
    // 404 JSON/빈 파일을 200으로 받는 케이스 방어 — PNG 아니면 storage에 안 올림.
    if (!isPng(raw)) throw new Error(`rotation ${dir} not a valid PNG (${raw.length}B)`);
    // 후보정(픽셀 부스러기 제거) 폐지 (2026-06-19) — v3 고품질 아바타에선 의도된 반짝임·미세
    // 디테일을 오히려 지워 역효과. 미러링된 원본 PNG를 그대로 업로드.
    const path = `${userId}/${characterId}/${dir}.png`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, raw, {
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
  serverId: number,
  userId: string,
  rotations: Record<string, string>,
  characterId: string,
  options: unknown,
  equipmentSnapshot: unknown,
  descriptionPrompt: string,
  verdict: ReviewVerdict,
): Promise<void> {
  // 얼굴 크롭용 머리 박스(검수 반환)를 options.faceBox로 동봉 — 헤더/친구 썸네일 정밀 크롭.
  const optionsWithFace = verdict.head
    ? { ...(options as Record<string, unknown>), faceBox: verdict.head }
    : options;
  await db.transaction(async (tx) => {
    const [profile] = await tx
      .insert(userProfiles)
      .values({
        userId,
        serverId,
        rotations,
        activeDirection: 'south',
        pixellabCharacterId: characterId,
        options: optionsWithFace,
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

    // 첫 프로필이면 자동 active — escrow 차감 서버의 캐릭터에.
    await tx
      .update(characters)
      .set({ activeProfileId: profile!.id })
      .where(
        and(
          eq(characters.userId, userId),
          eq(characters.serverId, serverId),
          sql`${characters.activeProfileId} IS NULL`,
        ),
      );

    await tx.insert(mailbox).values({
      userId,
      serverId,
      type: 'profile_accepted',
      title: '프로필 생성 완료',
      body: '새 프로필이 목록에 추가되었습니다. 상세 화면에서 8방향을 둘러보세요.',
      senderLabel: '시스템',
      payload: {},
    });
  });
  await safePush(userId, '프로필 생성 완료', '새 프로필이 목록에 추가되었어요. 확인해 보세요!', '/me/profiles');
}

/**
 * 운영자 분쟁 처리 — AI가 거절했지만 실제로 문제 없는 아바타를 직접 지급(다이아 차감 없음).
 * Pixellab 캐릭터에서 8방향을 Storage로 미러링 → user_profiles 생성 → 목록 추가 + 우편.
 * AI 거절 시 escrow는 이미 환불됐으므로 추가 차감/환불 없음(순수 지급).
 */
export async function adminGrantAvatarForJob(jobId: bigint): Promise<{ ok: boolean; msg?: string }> {
  const [job] = await db
    .select()
    .from(profileGenerationJobs)
    .where(eq(profileGenerationJobs.id, jobId))
    .limit(1);
  if (!job) return { ok: false, msg: '작업을 찾을 수 없습니다.' };
  if (job.userProfileId) return { ok: false, msg: '이미 아바타가 지급되어 있습니다.' };
  if (!job.pixellabCharacterId) return { ok: false, msg: 'Pixellab 캐릭터 정보가 없어 지급할 수 없습니다.' };

  const key = process.env.PIXELLAB_API_KEY;
  if (!key) return { ok: false, msg: 'PIXELLAB_API_KEY 미설정' };

  const charRes = await fetch(`${PIXELLAB_BASE}/characters/${job.pixellabCharacterId}`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!charRes.ok) return { ok: false, msg: `Pixellab 캐릭터 조회 실패 (HTTP ${charRes.status})` };
  const char = (await charRes.json()) as PixellabCharacterDetail;

  const remoteRotations: Record<string, string> = {};
  for (const [k, v] of Object.entries(char.rotation_urls ?? {})) {
    if (typeof v === 'string' && v.length > 0) remoteRotations[k] = v;
  }
  if (Object.keys(remoteRotations).length < 8) {
    return { ok: false, msg: '8방향 이미지가 완성되지 않아 지급할 수 없습니다.' };
  }

  const rotations = await mirrorRotations(job.pixellabCharacterId, remoteRotations, job.userId);
  if (Object.keys(rotations).length === 0) return { ok: false, msg: '이미지 미러링 실패' };

  await db.transaction(async (tx) => {
    const [profile] = await tx
      .insert(userProfiles)
      .values({
        userId: job.userId,
        serverId: job.serverId,
        rotations,
        activeDirection: 'south',
        pixellabCharacterId: job.pixellabCharacterId!,
        options: job.options,
        equipmentSnapshot: job.equipmentSnapshot,
        descriptionPrompt: job.descriptionPrompt,
      })
      .returning({ id: userProfiles.id });

    // 상태(rejected_ai 등)는 분쟁 이력 보존을 위해 유지 — 지급 사실은 adminDecision으로 기록.
    await tx
      .update(profileGenerationJobs)
      .set({ userProfileId: profile!.id, adminDecision: 'grant', adminReviewedAt: new Date() })
      .where(eq(profileGenerationJobs.id, jobId));

    // 첫 프로필이면 자동 active.
    await tx
      .update(characters)
      .set({ activeProfileId: profile!.id })
      .where(
        and(
          eq(characters.userId, job.userId),
          eq(characters.serverId, job.serverId),
          sql`${characters.activeProfileId} IS NULL`,
        ),
      );

    await tx.insert(mailbox).values({
      userId: job.userId,
      serverId: job.serverId,
      type: 'admin',
      title: '아바타 지급 안내',
      body: '안녕하세요, 운영팀입니다.\n\n생성하신 아바타를 운영팀이 직접 확인한 결과 문제가 없어 정상 지급해 드렸습니다.\n다이아 추가 차감 없이 프로필 목록에 추가되었으니, 상세 화면에서 8방향을 둘러보세요.\n\n불편을 드려 죄송합니다. 감사합니다.',
      senderLabel: '운영자',
      payload: {},
    });
  });
  // 운영자 결정은 우편으로만 통지 — 푸시 없음(사용자 결정).
  return { ok: true };
}

async function rejectJob(
  jobId: bigint,
  userId: string,
  serverId: number,
  escrow: bigint,
  verdict: ReviewVerdict,
): Promise<void> {
  // 카테고리 코드(영문) → 한글 라벨. 우편 본문이 영어로 보이지 않게.
  const REASON_KO: Record<string, string> = {
    nsfw: '선정성',
    violence: '폭력성',
    hate: '혐오 표현',
    quality: '형태·품질 오류',
  };
  const reasonsKr =
    verdict.reasons.length > 0 ? verdict.reasons.map((r) => REASON_KO[r] ?? r).join(', ') : '미상';
  const notes = verdict.notes || '검토 기준에 부합하지 않습니다.';
  await db.transaction(async (tx) => {
    // 환불 — escrow가 차감된 서버(잡 행 기록)로 반환.
    await walletAdd(tx, userId, serverId, escrow);

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
      serverId,
      type: 'profile_rejected_ai',
      title: '프로필 검토 미통과',
      body: `사유(${reasonsKr}): ${notes}\n\n다이아는 전액 환불되었습니다.`,
      senderLabel: '시스템',
      payload: {},
    });
  });
  await safePush(userId, '프로필 검토 미통과', '검토를 통과하지 못해 다이아를 환불했어요. 우편함을 확인하세요.', '/mail');
}

export async function markFailedAndRefund(jobId: bigint, userId: string, reason: string): Promise<void> {
  // 작업 정보 조회.
  const [job] = await db
    .select({
      escrow: profileGenerationJobs.diamondEscrow,
      status: profileGenerationJobs.status,
      serverId: profileGenerationJobs.serverId,
    })
    .from(profileGenerationJobs)
    .where(eq(profileGenerationJobs.id, jobId));
  if (!job || job.status === 'failed' || job.status === 'rejected_ai' || job.status === 'accepted') return;

  await db.transaction(async (tx) => {
    await walletAdd(tx, userId, job.serverId, job.escrow);

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
      serverId: job.serverId,
      type: 'profile_failed',
      title: '프로필 생성 시스템 오류',
      body: `생성 도중 시스템 오류가 발생해 다이아가 전액 환불되었습니다.\n다시 시도해 주세요.\n\n(내부 사유: ${reason.slice(0, 200)})`,
      senderLabel: '시스템',
      payload: {},
    });
  });
  await safePush(userId, '프로필 생성 실패', '시스템 오류로 다이아를 환불했어요. 다시 시도해 주세요.', '/mail');
}
