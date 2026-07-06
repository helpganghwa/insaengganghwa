/**
 * PROFILE §2 핵심 흐름 — Pixellab v2 큐 등록 + 폴링 + south 정면 다운로드 + Supabase
 * Storage 미러링 + Claude vision 자동 검토 + 분기(accepted/rejected_ai/failed).
 *
 * cron(`/api/cron/profile-poll`)에서 호출:
 *  - 발주(queued→starting→downloading)는 v3(pipeline-v3.ts drainQueue)가 담당.
 *  - pollAndProcessDownloading(): status='downloading' N건 → 폴링 → 완료시 process(이 파일).
 *
 * 외부 의존:
 *  - Pixellab v2 API (PIXELLAB_API_KEY) — GET /characters/{id} 폴링
 *  - Supabase Storage bucket `profiles` (public, 사용자 수동 생성)
 *  - Claude vision (ANTHROPIC_API_KEY) — ai-review.ts (모델 ID는 ai-review.ts MODEL_ID 단일 출처)
 */
import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { walletAdd } from '@/lib/game/wallet';
import { profileGenerationJobs, userProfiles } from '@/lib/db/schema/avatar';
import { mailbox } from '@/lib/db/schema/mailbox';

import { sendPushToUser } from '@/lib/push/send';

import { reviewProfile, type ReviewVerdict } from './ai-review';
import { pixellabKeyByIdx, keyIdxFromOptions } from './pixellab-keys';
import { anyBackgroundOpaque } from './bg-alpha';
import { detectFullBodyCrop } from './crop-check';
import { detectFaceBox, type FaceBox } from './face-box';

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

interface PixellabCharacterDetail {
  id: string;
  rotation_urls: Record<string, string | null>;
}

// ─── 폴링 + 처리 — status='downloading' N건 ───

/**
 * 동시성 — 이 함수는 잡을 잠그지 않고 select 후 느린 외부 호출(폴링·다운로드·AI검토)을 거쳐 terminal
 * 전이(accept/reject/fail)한다. 두 방어선이 동시처리 시 프로필 중복생성·이중환불을 막는다:
 *  ① 구조적(주방어, 감사 #2): accept/reject/markFailed 모두 **claim-first 조건부 전이**
 *     (`update … where status IN(...) returning` → 0행이면 즉시 종료)라, 두 워커가 같은 잡을 잡아도
 *     지급·환불·프로필생성은 **정확히 1회**만 일어난다.
 *  ② 운영적(보조): 유일 호출자가 profile-poll cron(2분=120s)이고 maxDuration=90s라 연속 invocation이
 *     절대 겹치지 않으며 루프 내 처리도 순차 — 애초에 동시 진입이 거의 없다.
 *
 * 🔒 새 호출자/병렬 처리를 추가하더라도 ①의 조건부 전이가 멱등을 보장하나, ②가 깨지면 락 경합·중복
 *    외부호출(Pixellab/AI 비용) 증가가 따르므로 동시 실행은 여전히 지양할 것.
 */
export async function pollAndProcessDownloading(limit = 5): Promise<{
  polled: number;
  accepted: number;
  rejected: number;
  failed: number;
  stillProcessing: number;
}> {
  if (!process.env.PIXELLAB_API_KEY) throw new Error('PIXELLAB_API_KEY missing');

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
    // ⚠️ 생성에 쓴 키로만 조회 가능 → 잡 options의 keyIdx로 키 선택(레거시=key1).
    const jobKey = pixellabKeyByIdx(keyIdxFromOptions(job.options));
    const charRes = await fetch(`${PIXELLAB_BASE}/characters/${job.characterId}`, {
      headers: { authorization: `Bearer ${jobKey}` },
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
    // 정면(south)만 사용 — v3 8방향 중 측/후면 품질이 낮아 정면만 저장·표시(회전 미사용, 2026-06-22).
    const southUrl = (typeof char.rotation_urls.south === 'string' && char.rotation_urls.south) || '';
    if (!southUrl) {
      stillProcessing += 1;
      continue;
    }

    try {
      const r = await fetch(southUrl);
      if (!r.ok) {
        // rotation_urls는 떴지만 실파일 아직 404(검증된 케이스) — 다음 tick 재시도.
        stillProcessing += 1;
        continue;
      }
      const png = Buffer.from(await r.arrayBuffer());
      if (!isPng(png)) {
        stillProcessing += 1;
        continue;
      }

      const review = await reviewProfile({
        images: [{ direction: 'south', png }],
        descriptionPrompt: job.description,
      });

      // 결정론 선차단 — AI 비전이 못 잡는 두 결함을 alpha로 직접 검사:
      //  ① 불투명 배경(no_background 실패)  ② 전신 잘림(하반신이 프레임 밖으로 잘림).
      // 검수기(ai-review)는 안전+해부학 모더레이터라 프레이밍/잘림을 판정하지 않는다.
      const [bgOpaque, cropResult] = await Promise.all([anyBackgroundOpaque([png]), detectFullBodyCrop(png)]);
      const cropped = cropResult.cropped;

      if (review.verdict.pass && !bgOpaque && !cropped) {
        // south 1장만 storage 미러 → rotations={south} (회전 미사용).
        const supabase = serviceClient();
        const path = `${job.userId}/${job.characterId}/south.png`;
        const up = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, png, { contentType: 'image/png', upsert: true, cacheControl: '604800' });
        if (up.error) throw new Error(`storage upload south: ${up.error.message}`);
        const rotations = { south: supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl };
        // 얼굴 크롭 박스 — 원본 south에서 결정론 검출(실패 시 검수 head 폴백).
        const faceBox = (await detectFaceBox(png)) ?? review.verdict.head ?? null;
        await acceptJob(job.id, job.serverId, job.userId, rotations, job.characterId, job.options, job.equipmentSnapshot, job.description, review.verdict, faceBox);
        accepted += 1;
      } else {
        let verdict: ReviewVerdict = review.verdict;
        if (bgOpaque)
          verdict = { ...verdict, pass: false, reasons: [...new Set([...verdict.reasons, 'quality' as const])], notes: verdict.notes || '배경이 투명하지 않습니다(불투명 배경 검출).' };
        if (cropped)
          verdict = { ...verdict, pass: false, reasons: [...new Set([...verdict.reasons, 'quality' as const])], notes: verdict.notes || '전신이 아닌 잘린 캐릭터입니다(하반신이 프레임에서 잘림).' };
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
  faceBox: FaceBox | null,
): Promise<void> {
  // 얼굴 크롭 박스(원본 south 결정론 검출)를 options.faceBox로 동봉 — 헤더/친구 썸네일 정밀 크롭.
  const optionsWithFace = faceBox
    ? { ...(options as Record<string, unknown>), faceBox }
    : options;
  await db.transaction(async (tx) => {
    // 조건부 클레임 먼저(감사 #2) — downloading인 경우만 accepted로 전이. 0행이면 다른 워커가
    // 이미 처리한 것(P1 불변식 위반 시) → 프로필 중복생성 방지로 즉시 종료. userProfileId는
    // 프로필 insert 후 backfill.
    const claimed = await tx
      .update(profileGenerationJobs)
      .set({ status: 'accepted', aiVerdict: verdict, resolvedAt: sql`now()` })
      .where(
        and(eq(profileGenerationJobs.id, jobId), eq(profileGenerationJobs.status, 'downloading')),
      )
      .returning({ id: profileGenerationJobs.id });
    if (claimed.length === 0) return;

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
      .set({ userProfileId: profile!.id })
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
      title: '아바타 생성 완료',
      body: '새 아바타가 목록에 추가되었습니다. 아바타 목록에서 확인해 보세요.',
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

  if (!process.env.PIXELLAB_API_KEY) return { ok: false, msg: 'PIXELLAB_API_KEY 미설정' };
  // ⚠️ 생성에 쓴 키로만 조회 가능 → 잡 options의 keyIdx로 키 선택(레거시=key1).
  const key = pixellabKeyByIdx(keyIdxFromOptions(job.options));

  const charRes = await fetch(`${PIXELLAB_BASE}/characters/${job.pixellabCharacterId}`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!charRes.ok) return { ok: false, msg: `Pixellab 캐릭터 조회 실패 (HTTP ${charRes.status})` };
  const char = (await charRes.json()) as PixellabCharacterDetail;

  // 정면(south)만 사용 — 회전 미사용(2026-06-22).
  const southUrl = (typeof char.rotation_urls?.south === 'string' && char.rotation_urls.south) || '';
  if (!southUrl) return { ok: false, msg: '정면 이미지가 완성되지 않아 지급할 수 없습니다.' };
  const sres = await fetch(southUrl);
  if (!sres.ok) return { ok: false, msg: `정면 이미지 다운로드 실패 (HTTP ${sres.status})` };
  const spng = Buffer.from(await sres.arrayBuffer());
  if (!isPng(spng)) return { ok: false, msg: '정면 이미지가 유효하지 않습니다.' };
  const supabase = serviceClient();
  const spath = `${job.userId}/${job.pixellabCharacterId}/south.png`;
  const sup = await supabase.storage.from(STORAGE_BUCKET).upload(spath, spng, { contentType: 'image/png', upsert: true, cacheControl: '604800' });
  if (sup.error) return { ok: false, msg: `이미지 미러링 실패: ${sup.error.message}` };
  const rotations = { south: supabase.storage.from(STORAGE_BUCKET).getPublicUrl(spath).data.publicUrl };
  const faceBox = await detectFaceBox(spng);
  const adminOptions = faceBox
    ? { ...(job.options as Record<string, unknown>), faceBox }
    : job.options;

  await db.transaction(async (tx) => {
    const [profile] = await tx
      .insert(userProfiles)
      .values({
        userId: job.userId,
        serverId: job.serverId,
        rotations,
        activeDirection: 'south',
        pixellabCharacterId: job.pixellabCharacterId!,
        options: adminOptions,
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
      body: '안녕하세요, 운영팀입니다.\n\n생성하신 아바타를 운영팀이 직접 확인한 결과 문제가 없어 정상 지급해 드렸습니다.\n다이아 추가 차감 없이 아바타 목록에 추가되었으니 확인해 보세요.\n\n불편을 드려 죄송합니다. 감사합니다.',
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
  // 상세 사유(notes)는 운영자 분쟁처리(admin)·감사용으로 rejectReason/aiVerdict에만 보존하고,
  // 유저 우편은 운영자 리젝과 동일한 공통 안내문구로 표시(상세 결함 미노출).
  const notes = verdict.notes || '검토 기준에 부합하지 않습니다.';
  const userBody =
    '생성하신 아바타가 검토 기준에 부합하지 않아 적용되지 않았어요.\n사용하신 다이아는 전액 환불해 드렸으니, 환불 다이아로 언제든 다시 생성하실 수 있습니다.\n\n불편을 드려 죄송합니다.';
  const did = await db.transaction(async (tx) => {
    // 조건부 클레임 먼저(감사 #2, money path) — downloading일 때만 rejected_ai로 전이. 0행이면
    // 다른 워커가 이미 처리(P1 불변식 위반 시) → 환불 skip해 이중환불 방지.
    const claimed = await tx
      .update(profileGenerationJobs)
      .set({
        status: 'rejected_ai',
        aiVerdict: verdict,
        rejectReason: notes,
        resolvedAt: sql`now()`,
      })
      .where(
        and(eq(profileGenerationJobs.id, jobId), eq(profileGenerationJobs.status, 'downloading')),
      )
      .returning({ id: profileGenerationJobs.id });
    if (claimed.length === 0) return false;

    // 환불 — escrow가 차감된 서버(잡 행 기록)로 반환.
    await walletAdd(tx, userId, serverId, escrow);

    await tx.insert(mailbox).values({
      userId,
      serverId,
      type: 'profile_rejected_ai',
      title: '아바타 검토 미통과',
      body: userBody,
      senderLabel: '시스템',
      payload: {},
    });
    return true;
  });
  if (did) {
    await safePush(userId, '아바타 검토 미통과', '검토를 통과하지 못해 다이아를 환불했어요. 우편함을 확인하세요.', '/mail');
  }
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

  const did = await db.transaction(async (tx) => {
    // 조건부 클레임 먼저(감사 #2, money path) — 비종단(queued/starting/downloading)일 때만 failed로 전이.
    // 0행이면 다른 워커가 이미 처리(P1 불변식 위반·동시 P2 타임아웃 등) → 환불 skip해 이중환불 방지.
    // 호출처: queued(P2 타임아웃)·starting(발주 실패/스윕)·downloading(poll 실패).
    const claimed = await tx
      .update(profileGenerationJobs)
      .set({
        status: 'failed',
        rejectReason: reason.slice(0, 500),
        resolvedAt: sql`now()`,
      })
      .where(
        and(
          eq(profileGenerationJobs.id, jobId),
          inArray(profileGenerationJobs.status, ['queued', 'starting', 'downloading']),
        ),
      )
      .returning({ id: profileGenerationJobs.id });
    if (claimed.length === 0) return false;

    await walletAdd(tx, userId, job.serverId, job.escrow);

    await tx.insert(mailbox).values({
      userId,
      serverId: job.serverId,
      type: 'profile_failed',
      title: '아바타 생성 시스템 오류',
      body: '생성 도중 시스템 오류가 발생해 다이아가 전액 환불되었습니다.\n다시 시도해 주세요.',
      senderLabel: '시스템',
      payload: {},
    });
    return true;
  });
  if (did) {
    await safePush(userId, '아바타 생성 실패', '시스템 오류로 다이아를 환불했어요. 다시 시도해 주세요.', '/mail');
  }
}
