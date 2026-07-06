import 'server-only';

import { sql, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { guilds } from '@/lib/db/schema/guild';

/**
 * 회원탈퇴 — 게임 데이터 파기 + PII 제거, 결제·본인인증·미성년한도는 법정 보존(익명화 in-place).
 *
 * profiles 행은 삭제하지 않는다(iap_orders FK가 NO ACTION = 결제기록 보존 앵커). 대신 profiles에
 * 연결된 게임 데이터를 명시 삭제하고 withdrawn_at을 찍는다. 닉네임(characters)·아바타(user_profiles)는
 * 삭제로 제거된다. 재로그인 시 캐릭터가 없으므로 신규처럼 온보딩(즉시 재가입=새 시작).
 *
 * 보존(삭제 안 함): iap_orders, iap_refunds, identity_verifications, monthly_purchase_limits.
 * 길드장은 위임/해산 선행 필요(LEADER_MUST_TRANSFER) — guilds.leader FK 보호.
 */
export class WithdrawError extends Error {
  constructor(public code: 'LEADER_MUST_TRANSFER') {
    super(code);
    this.name = 'WithdrawError';
  }
}

export async function withdrawAccount(userId: string): Promise<void> {
  // 길드장이면 탈퇴 불가(위임/해산 먼저) — guilds.leader_user_id는 NO ACTION FK.
  const [led] = await db
    .select({ id: guilds.id })
    .from(guilds)
    .where(eq(guilds.leaderUserId, userId))
    .limit(1);
  if (led) throw new WithdrawError('LEADER_MUST_TRANSFER');

  const uid = sql`${userId}::uuid`;

  await db.transaction(async (tx) => {
    // FK 자식 → 부모 순서. 대부분 profiles FK라 상호 독립이나, 명시 의존만 순서 보장.
    // 레이드: 자식(공격/참가/보상/요청/카운트) 먼저, 그다음 호스트 레이드(잔여 자식 cascade).
    await tx.execute(sql`delete from raid_attacks where user_id = ${uid}`);
    await tx.execute(sql`delete from raid_participants where user_id = ${uid}`);
    await tx.execute(sql`delete from raid_rewards where user_id = ${uid}`);
    await tx.execute(sql`delete from raid_join_requests where user_id = ${uid}`);
    await tx.execute(sql`delete from raid_daily_counts where user_id = ${uid}`);
    await tx.execute(sql`delete from raids where host_user_id = ${uid}`);

    // 길드(멤버십·신청·배치·로그). 길드장 아님은 위에서 보장.
    await tx.execute(sql`delete from guild_join_requests where user_id = ${uid}`);
    await tx.execute(sql`delete from guild_battle_deployments where user_id = ${uid}`);
    await tx.execute(sql`delete from guild_leave_log where user_id = ${uid}`);
    await tx.execute(sql`delete from guild_members where user_id = ${uid}`);

    // 신고(내가 한 신고 + 내 프로필 대상 신고) → user_profiles보다 먼저.
    await tx.execute(
      sql`delete from profile_reports where reporter_user_id = ${uid} or profile_id in (select id from user_profiles where user_id = ${uid})`,
    );

    // 우편(수령로그 → 우편), 출석(로그 → 상태), 배틀패스(구간 → 상태).
    await tx.execute(sql`delete from mail_claim_logs where user_id = ${uid}`);
    await tx.execute(sql`delete from mailbox where user_id = ${uid}`);
    await tx.execute(sql`delete from checkin_claim_logs where user_id = ${uid}`);
    await tx.execute(sql`delete from user_checkin_state where user_id = ${uid}`);
    await tx.execute(sql`delete from battlepass_segments where user_id = ${uid}`);
    await tx.execute(sql`delete from battlepass_state where user_id = ${uid}`);

    // 강화/초월/보급 이력·상태.
    await tx.execute(sql`delete from enhancement_logs where user_id = ${uid}`);
    await tx.execute(sql`delete from gem_time_reductions where user_id = ${uid}`);
    await tx.execute(sql`delete from enhancement_jobs where user_id = ${uid}`);
    await tx.execute(sql`delete from transcend_logs where user_id = ${uid}`);
    await tx.execute(sql`delete from supply_open_logs where user_id = ${uid}`);
    await tx.execute(sql`delete from user_supply_boxes where user_id = ${uid}`);
    await tx.execute(sql`delete from user_equipment where user_id = ${uid}`);

    // 상점/보급 지급 기록(주기 멱등용 — 재가입 시 새 시작이라 제거).
    await tx.execute(sql`delete from daily_supply_grants where user_id = ${uid}`);
    await tx.execute(sql`delete from premium_daily_grants where user_id = ${uid}`);
    await tx.execute(sql`delete from shop_free_claims where user_id = ${uid}`);
    await tx.execute(sql`delete from shop_purchases where user_id = ${uid}`);

    // 대난투 참가(챔피언 기록은 익명화로 보존 — 아래 set null).
    await tx.execute(sql`delete from melee_participants where user_id = ${uid}`);
    await tx.execute(sql`update melee_battles set champion_user_id = null where champion_user_id = ${uid}`);

    // 친구·추천·공유·광고·푸시.
    await tx.execute(sql`delete from friend_links where requester_id = ${uid} or addressee_id = ${uid}`);
    await tx.execute(sql`delete from referral_attributions where referrer_user_id = ${uid} or new_user_id = ${uid}`);
    await tx.execute(sql`delete from shares where user_id = ${uid}`);
    await tx.execute(sql`delete from ad_views where user_id = ${uid}`);
    await tx.execute(sql`delete from push_pending where user_id = ${uid}`);
    await tx.execute(sql`delete from push_subscriptions where user_id = ${uid}`);

    // 아바타(프로필 생성잡 → 활성프로필 SET NULL → 프로필) + 캐릭터(닉네임).
    await tx.execute(sql`delete from profile_generation_jobs where user_id = ${uid}`);
    await tx.execute(sql`delete from user_profiles where user_id = ${uid}`);
    await tx.execute(sql`delete from characters where user_id = ${uid}`);

    // PII 제거 마킹 — profiles 자체는 결제 보존 앵커라 유지. 활성 프로필/배경 초기화 + 탈퇴 시각.
    // 본인인증 파생 필드도 클리어(감사 F-14) — 연도 해시는 후보 ~120개라 사실상 가역이라
    // "탈퇴 시 지체 없이 파기" 대상. 결제 경로 판정(minorStatus)은 법정 보존 원장인
    // identity_verifications를 읽으므로 영향 없음 — 이 필드들은 설정 화면 표시 전용.
    await tx
      .update(profiles)
      .set({
        activeBackground: null,
        withdrawnAt: new Date(),
        birthYearHash: null,
        isAdult: false,
        identityVerifiedAt: null,
      })
      .where(eq(profiles.id, userId));
  });
}
