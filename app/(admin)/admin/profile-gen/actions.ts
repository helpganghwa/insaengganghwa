'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { safeBigInt } from '@/lib/util/id';
import { db } from '@/lib/db/client';
import { avatarReturnRequests, profileGenerationJobs, userProfiles } from '@/lib/db/schema/avatar';
import { characters } from '@/lib/db/schema/server';
import { mailbox } from '@/lib/db/schema/mailbox';
import { walletAdd } from '@/lib/game/wallet';
import { adminActions } from '@/lib/db/schema/ops';
import { adminGrantAvatarForJob } from '@/lib/game/profile/pipeline';
import { setAvatarGenPause } from '@/lib/game/profile/gen-pause';

/**
 * 통과 아바타 회수 + 다이아 환불 (분쟁 처리).
 * - user_profile 삭제 + (대표였다면) active 해제 → 유저 컬렉션/표시에서 회수
 * - escrow 다이아 환불(walletAdd)
 * - 잡에 회수 사유 기록 + 운영자 우편 통지
 */
/**
 * 운영 조치 기록(2026-09-12 전수조사) — 아바타 검수의 환불 두 종은 재화가 움직이는데 실행자가
 * 어디에도 남지 않았다. 옆 도메인(아바타 반환 판정)은 기록하는데 여기만 빠져 있었다.
 * 지급 트랜잭션과 같은 tx에 넣어, 롤백되면 기록도 함께 사라지게 한다.
 */
/** 트랜잭션 타입 — 캐스트 대신 정식 타입을 쓴다(7차 검수: `as unknown as`가 컬럼 오타를 못 잡았다). */
type LogTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
function logJob(
  tx: LogTx,
  adminUserId: string,
  action: string,
  jobId: string,
  payload: Record<string, unknown>,
) {
  return tx.insert(adminActions).values({ adminUserId, action, targetType: 'profile_generation_job', targetId: jobId, payload });
}

export async function adminRevokeAndRefund(jobId: string): Promise<{ ok: boolean; msg?: string }> {
  const adminUserId = await requireAdmin();
  const jid = safeBigInt(jobId);
  if (jid === null) return { ok: false, msg: '잘못된 작업 ID입니다.' };
  const [job] = await db
    .select()
    .from(profileGenerationJobs)
    .where(eq(profileGenerationJobs.id, jid))
    .limit(1);
  if (!job) return { ok: false, msg: '작업을 찾을 수 없습니다.' };
  if (!job.userProfileId) return { ok: false, msg: '연결된 아바타가 없습니다(통과 건 아님/이미 회수됨).' };
  const profileId = job.userProfileId;

  const claimed = await db.transaction(async (tx) => {
    // 조건부 클레임 먼저(money path) — 게이트(:28)는 비잠금 read라 동시 더블클릭이 둘 다
    // 통과할 수 있다. user_profile_id가 아직 그 값일 때만 전이시켜 환불을 정확히 1회로.
    const rows = await tx
      .update(profileGenerationJobs)
      .set({
        userProfileId: null,
        rejectReason: '운영자 회수(분쟁) — 다이아 환불',
        adminDecision: 'reject',
        adminReviewedAt: new Date(),
      })
      .where(and(eq(profileGenerationJobs.id, job.id), eq(profileGenerationJobs.userProfileId, profileId)))
      .returning({ id: profileGenerationJobs.id });
    if (rows.length === 0) return false;
    // 대표였다면 유저의 기본 아바타로 전환(신고 플로우 resetReportedAvatar와 동일 정책) —
    // null로만 두면 /u·랭킹 등에서 빈 영역이 표시됨(2026-07-18 바람 사례).
    const [def] = await tx
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.userId, job.userId),
          eq(userProfiles.serverId, job.serverId),
          sql`(${userProfiles.options} ->> 'isDefault') = 'true'`,
        ),
      )
      .limit(1);
    await tx
      .update(characters)
      // 대표가 실제로 바뀌므로 유지 시작(0166, 한결같은 얼굴 판정)도 리셋.
      .set({ activeProfileId: def?.id ?? null, activeProfileSince: sql`now()` })
      .where(
        and(
          eq(characters.userId, job.userId),
          eq(characters.serverId, job.serverId),
          eq(characters.activeProfileId, profileId),
        ),
      );
    await tx.delete(userProfiles).where(eq(userProfiles.id, profileId));
    await walletAdd(tx, job.userId, job.serverId, job.diamondEscrow, 'avatar_refund', `job:${job.id}`);
    await logJob(tx, adminUserId, 'avatar.revoke_refund', job.id.toString(), {
      userId: job.userId, serverId: job.serverId, diamond: Number(job.diamondEscrow),
    });
    await tx.insert(mailbox).values({
      userId: job.userId,
      serverId: job.serverId,
      type: 'admin',
      title: '아바타 회수 안내 (다이아 환불 완료)',
      body: `안녕하세요, 운영팀입니다.\n\n생성하신 아바타가 운영 검수 결과 게임 내 표시 기준에 부합하지 않아 부득이하게 회수되었습니다.\n사용하신 다이아 ${job.diamondEscrow.toString()}개는 전액 환불해 드렸으며, 환불 다이아로 언제든 다시 생성하실 수 있습니다.\n\n불편을 드려 진심으로 죄송합니다. 더 좋은 결과로 보답하겠습니다.`,
      senderLabel: '운영자',
      payload: {},
    });
    return true;
  });
  revalidatePath('/admin/profile-gen');
  if (!claimed) return { ok: false, msg: '이미 처리된 건입니다(동시 요청).' };
  return { ok: true };
}

/**
 * 환불만(회수 없음) — 유저가 아바타를 이미 삭제해 회수할 대상이 없는 accepted 건의 분쟁 환불.
 * 조건부 클레임(adminDecision != 'reject' AND user_profile_id IS NULL)으로 정확히 1회.
 * reject로 마킹되므로 첫 생성 할인 이력에서도 제외된다(회수+환불과 동일 정산 의미).
 */
export async function adminRefundOnly(jobId: string): Promise<{ ok: boolean; msg?: string }> {
  const adminUserId = await requireAdmin();
  const jid = safeBigInt(jobId);
  if (jid === null) return { ok: false, msg: '잘못된 작업 ID입니다.' };
  const [job] = await db
    .select()
    .from(profileGenerationJobs)
    .where(eq(profileGenerationJobs.id, jid))
    .limit(1);
  if (!job) return { ok: false, msg: '작업을 찾을 수 없습니다.' };
  if (job.status !== 'accepted') return { ok: false, msg: 'accepted(과금 완료) 건만 환불할 수 있습니다.' };
  if (job.userProfileId) return { ok: false, msg: '아바타가 남아 있습니다 — 리젝(회수+환불)을 사용하세요.' };
  if (job.diamondEscrow <= 0n) return { ok: false, msg: '환불할 다이아가 없습니다.' };
  // 유저가 '아바타 반환'으로 이미 회수한 건이면 user_profile_id가 null이라 여기까지 온다 — 반환 요청과 이중 지급 금지.
  if (job.pixellabCharacterId) {
    const [ret] = await db
      .select({ id: avatarReturnRequests.id, status: avatarReturnRequests.status, refund: avatarReturnRequests.refundDiamond })
      .from(avatarReturnRequests)
      .where(sql`${avatarReturnRequests.spriteUrl} like ${'%/' + job.pixellabCharacterId + '/%'}`)
      .limit(1);
    if (ret?.status === 'pending') return { ok: false, msg: `이 아바타는 유저가 반환 신청(#${ret.id})했습니다 — 반환 검토 화면에서 전액/절반을 판정하세요(이중 지급 방지).` };
    if (ret && ret.status !== 'closed') return { ok: false, msg: `이 아바타는 반환 보상(#${ret.id}, 💎${Number(ret.refund ?? 0)})이 이미 지급됐습니다 — 추가 환불 불가.` };
  }

  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .update(profileGenerationJobs)
      .set({
        rejectReason: '운영자 환불(분쟁·아바타 기삭제) — 다이아 환불',
        adminDecision: 'reject',
        adminReviewedAt: new Date(),
      })
      .where(
        and(
          eq(profileGenerationJobs.id, job.id),
          sql`${profileGenerationJobs.adminDecision} IS DISTINCT FROM 'reject'`,
          sql`${profileGenerationJobs.userProfileId} IS NULL`,
        ),
      )
      .returning({ id: profileGenerationJobs.id });
    if (rows.length === 0) return false;
    await walletAdd(tx, job.userId, job.serverId, job.diamondEscrow, 'avatar_refund', `job:${job.id}`);
    await logJob(tx, adminUserId, 'avatar.refund', job.id.toString(), {
      userId: job.userId, serverId: job.serverId, diamond: Number(job.diamondEscrow),
    });
    await tx.insert(mailbox).values({
      userId: job.userId,
      serverId: job.serverId,
      type: 'admin',
      title: '아바타 생성 다이아 환불 안내',
      body: `안녕하세요, 운영팀입니다.\n\n문의 주신 아바타 생성 건에 대해 사용하신 다이아 ${job.diamondEscrow.toString()}개를 전액 환불해 드렸습니다.\n환불 다이아로 언제든 다시 생성하실 수 있습니다.\n\n이용해 주셔서 감사합니다.`,
      senderLabel: '운영자',
      payload: {},
    });
    return true;
  });
  revalidatePath('/admin/profile-gen');
  if (!claimed) return { ok: false, msg: '이미 환불 처리된 건입니다.' };
  return { ok: true };
}

/**
 * 아바타 지급 (다이아 차감 없음) — AI가 거절했지만 실제로 문제 없는 아바타를 직접 지급.
 * Storage 미러링 + user_profiles 생성 + 목록 추가 + 우편(pipeline.adminGrantAvatarForJob).
 * AI 거절 시 escrow는 이미 환불됐으므로 추가 차감/환불 없음(순수 지급).
 */
export async function adminGrantAvatar(jobId: string): Promise<{ ok: boolean; msg?: string }> {
  await requireAdmin();
  const jid = safeBigInt(jobId);
  if (jid === null) return { ok: false, msg: '잘못된 작업 ID입니다.' };
  const r = await adminGrantAvatarForJob(jid);
  revalidatePath('/admin/profile-gen');
  return r;
}

/**
 * 확인(무조치) — AI 결정에 동의, 사용자 영향/우편 없음. 검수 완료 표시만 기록.
 * 날짜별 점검 시 "검수함"으로 분류돼 미검수 건과 구분된다.
 */
export async function adminConfirmReview(jobId: string): Promise<{ ok: boolean; msg?: string }> {
  await requireAdmin();
  const jid = safeBigInt(jobId);
  if (jid === null) return { ok: false, msg: '잘못된 작업 ID입니다.' };
  await db
    .update(profileGenerationJobs)
    .set({ adminDecision: 'confirm', adminReviewedAt: new Date() })
    .where(eq(profileGenerationJobs.id, jid));
  revalidatePath('/admin/profile-gen');
  return { ok: true };
}

/**
 * 아바타 생성 일시 중지 전환(gen-pause.ts) — 외부 생성 서비스 장애 때 새 요청을 막는다.
 * 이미 들어간 잡은 그대로 진행되고 실패하면 기존 경로가 환불한다. 전환마다 admin_actions에 남긴다.
 */
export async function setAvatarGenPauseAction(paused: boolean, note: string): Promise<{ ok: boolean }> {
  const adminUserId = await requireAdmin();
  const trimmed = note.trim().slice(0, 200) || null;
  await setAvatarGenPause(paused, adminUserId, trimmed);
  await db.insert(adminActions).values({
    adminUserId,
    action: paused ? 'avatar_gen_pause' : 'avatar_gen_resume',
    targetType: 'system_mode',
    targetId: 'avatar_gen',
    payload: { note: trimmed },
  });
  revalidatePath('/admin/profile-gen');
  revalidatePath('/me/create');
  return { ok: true };
}

/**
 * 얼굴 위치 조정(2026-10-05) — 운영자가 검수 화면에서 faceBox를 직접 맞춘다(유저는 못 바꾼다).
 * faceBox는 jsonb_build_object로 넣는다(문자열 이중 인코딩 사고 08-25·08-31). 얼굴 썸네일은 새 경로에 다시 그려
 * 올린다 — 같은 경로 덮어쓰기는 CDN 7일 캐시에 막혀 바뀐 크롭이 안 보였다(6차 교정). 조치 기록은 남기지 않는다(사용자 결정).
 */
export async function adminSaveFaceBox(
  profileId: string,
  box: { cx: number; cy: number; h: number },
): Promise<{ ok: boolean; msg?: string; face?: string }> {
  await requireAdmin();
  const ok = (n: unknown, lo: number, hi: number) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
  if (!/^[0-9a-f-]{36}$/i.test(profileId) || !ok(box.cx, 0, 1) || !ok(box.cy, 0, 1) || !ok(box.h, 0.04, 0.4)) {
    return { ok: false, msg: '값이 올바르지 않습니다.' };
  }
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  const fb = { cx: r4(box.cx), cy: r4(box.cy), h: r4(box.h) };
  const [row] = await db
    .select({ rotations: userProfiles.rotations })
    .from(userProfiles)
    .where(eq(userProfiles.id, profileId))
    .limit(1);
  const south = (row?.rotations as Record<string, string> | null)?.south;
  const m = south?.match(/\/object\/public\/profiles\/(.+)\/south(_flip)?\.png/);
  if (!south || !m) return { ok: false, msg: '아바타 이미지를 찾지 못했습니다.' };
  const res = await fetch(south, { cache: 'no-store' });
  if (!res.ok) return { ok: false, msg: `이미지를 불러오지 못했습니다(${res.status}).` };
  const { renderFaceThumb } = await import('@/lib/game/profile/face-thumb');
  const { serviceClient, STORAGE_BUCKET } = await import('@/lib/game/profile/pipeline');
  const thumb = await renderFaceThumb(Buffer.from(await res.arrayBuffer()), fb);
  const fpath = `${m[1]}/face${m[2] ?? ''}-${Date.now().toString(36)}.png`;
  const supabase = serviceClient();
  const up = await supabase.storage.from(STORAGE_BUCKET).upload(fpath, thumb, { contentType: 'image/png', upsert: true, cacheControl: '604800' });
  if (up.error) return { ok: false, msg: `썸네일 업로드 실패: ${up.error.message}` };
  const face = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fpath).data.publicUrl;
  await db.execute(sql`
    update user_profiles set
      options = jsonb_set(coalesce(options, '{}'::jsonb), '{faceBox}', jsonb_build_object('cx', ${fb.cx}::float, 'cy', ${fb.cy}::float, 'h', ${fb.h}::float)),
      rotations = jsonb_set(rotations, '{face}', to_jsonb(${face}::text))
    where id = ${profileId}::uuid
  `);
  revalidatePath('/admin/profile-gen');
  return { ok: true, face };
}
