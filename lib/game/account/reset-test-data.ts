import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

/**
 * 오픈 전 테스트 데이터 청소(2026-08-21) — 심사(cbt@~cbt5)·어드민 계정의 **게임 데이터만**
 * 리셋한다. 봉인(cbt_ended) 기간에 데이터를 만들 수 있는 건 이 계정들뿐이므로(일반 카카오
 * 콜백 차단), 이 청소가 곧 "오픈 월드에서 테스트 흔적 제거"의 전체 커버리지다.
 *
 * withdrawAccount(탈퇴)와의 차이 — 계정은 살아 있어야 한다:
 *  - profiles 마킹(withdrawnAt·PII 클리어) 없음 · push_subscriptions 유지 · 문의 보존
 *  - referral_attributions 보존(탈퇴와 동일 사유 — 1인 1회 잠금장치)
 *  - 추가: 대상이 길드장인 길드는 통째 정리(테스트 길드 — cutover WIPE 순서 준수)
 *
 * 청소 후 재로그인하면 캐릭터가 새로 생성되어(tutorial_step=1) 신규 유저 플로우
 * (튜토리얼 포함)를 그대로 테스트할 수 있다.
 */
export async function resetTestAccountsGameData(): Promise<{ users: number; guilds: number }> {
  const REVIEW_EMAILS = [
    'cbt@ganghwa.app', 'cbt2@ganghwa.app', 'cbt3@ganghwa.app', 'cbt4@ganghwa.app', 'cbt5@ganghwa.app',
  ];
  return await db.transaction(async (tx) => {
    const targets = (await tx.execute(sql`
      select p.id from profiles p
      where p.is_admin
         or p.id in (select id from auth.users where email = any(${REVIEW_EMAILS}))
    `)) as unknown as { id: string }[];
    if (targets.length === 0) return { users: 0, guilds: 0 };
    const ids = sql.join(targets.map((t) => sql`${t.id}::uuid`), sql`, `);
    const uid = sql`in (${ids})`;

    // 대상이 길드장인 테스트 길드 — 통째 정리(cutover-live WIPE 순서 준수, guild_id 한정).
    const guilds = (await tx.execute(sql`
      select id from guilds where leader_user_id ${uid}
    `)) as unknown as { id: string }[];
    if (guilds.length > 0) {
      const gids = sql`in (${sql.join(guilds.map((g) => sql`${g.id}::bigint`), sql`, `)})`;
      await tx.execute(sql`delete from guild_emblem_escrows where guild_id ${gids}`);
      await tx.execute(sql`delete from guild_audit_log where guild_id ${gids}`);
      await tx.execute(sql`delete from guild_tax_distributions where guild_id ${gids}`);
      await tx.execute(sql`delete from conquest_battles where attacker_guild_id ${gids} or defender_guild_id ${gids}`);
      await tx.execute(sql`delete from guild_battle_deployments where guild_id ${gids}`);
      await tx.execute(sql`delete from guild_join_requests where guild_id ${gids}`);
      await tx.execute(sql`delete from guild_members where guild_id ${gids}`);
      await tx.execute(sql`update zones set owner_guild_id = null where owner_guild_id ${gids}`);
      await tx.execute(sql`delete from guild_emblems where guild_id ${gids}`);
      await tx.execute(sql`delete from guilds where id ${gids}`);
    }

    // 유저 단위 게임 데이터 — withdrawAccount와 동일 시퀀스(계정·구독·referral 제외).
    await tx.execute(sql`delete from raid_invites where invitee_user_id ${uid} or inviter_user_id ${uid}`);
    await tx.execute(sql`delete from raid_attacks where user_id ${uid}`);
    await tx.execute(sql`delete from raid_participants where user_id ${uid}`);
    await tx.execute(sql`delete from raid_rewards where user_id ${uid}`);
    await tx.execute(sql`delete from raid_join_requests where user_id ${uid}`);
    await tx.execute(sql`delete from raid_daily_counts where user_id ${uid}`);
    await tx.execute(sql`delete from raids where host_user_id ${uid}`);
    await tx.execute(sql`delete from guild_join_requests where user_id ${uid}`);
    await tx.execute(sql`delete from guild_battle_deployments where user_id ${uid}`);
    await tx.execute(sql`delete from guild_leave_log where user_id ${uid}`);
    await tx.execute(sql`delete from guild_members where user_id ${uid}`);
    await tx.execute(sql`delete from profile_reports where reporter_user_id ${uid} or profile_id in (select id from user_profiles where user_id ${uid})`);
    await tx.execute(sql`delete from mail_claim_logs where user_id ${uid}`);
    await tx.execute(sql`delete from mailbox where user_id ${uid}`);
    await tx.execute(sql`delete from checkin_claim_logs where user_id ${uid}`);
    await tx.execute(sql`delete from user_checkin_state where user_id ${uid}`);
    await tx.execute(sql`delete from battlepass_segments where user_id ${uid}`);
    await tx.execute(sql`delete from battlepass_state where user_id ${uid}`);
    await tx.execute(sql`delete from enhancement_logs where user_id ${uid}`);
    await tx.execute(sql`delete from gem_time_reductions where user_id ${uid}`);
    await tx.execute(sql`delete from enhancement_jobs where user_id ${uid}`);
    await tx.execute(sql`delete from transcend_logs where user_id ${uid}`);
    await tx.execute(sql`delete from supply_open_logs where user_id ${uid}`);
    await tx.execute(sql`delete from user_supply_boxes where user_id ${uid}`);
    await tx.execute(sql`delete from user_equipment where user_id ${uid}`);
    await tx.execute(sql`delete from daily_supply_grants where user_id ${uid}`);
    await tx.execute(sql`delete from premium_daily_grants where user_id ${uid}`);
    await tx.execute(sql`delete from shop_free_claims where user_id ${uid}`);
    await tx.execute(sql`delete from shop_purchases where user_id ${uid}`);
    await tx.execute(sql`delete from melee_participants where user_id ${uid}`);
    await tx.execute(sql`update melee_battles set champion_user_id = null where champion_user_id ${uid}`);
    await tx.execute(sql`delete from friend_links where requester_id ${uid} or addressee_id ${uid}`);
    await tx.execute(sql`delete from shares where user_id ${uid}`);
    await tx.execute(sql`delete from ad_views where user_id ${uid}`);
    await tx.execute(sql`delete from push_pending where user_id ${uid}`);
    await tx.execute(sql`delete from whisper_reads where user_id ${uid} or peer_user_id ${uid}`);
    await tx.execute(sql`delete from whisper_messages where from_user_id ${uid} or to_user_id ${uid}`);
    await tx.execute(sql`delete from chat_messages where user_id ${uid}`);
    await tx.execute(sql`delete from leaderboard_ranks where user_id ${uid}`);
    await tx.execute(sql`delete from codex_champions where user_id ${uid}`);
    await tx.execute(sql`delete from user_milestones where user_id ${uid}`);
    await tx.execute(sql`delete from user_daily_stats where user_id ${uid}`);
    await tx.execute(sql`delete from challenge_claims where user_id ${uid}`);
    await tx.execute(sql`delete from challenge_events where user_id ${uid}`);
    await tx.execute(sql`delete from user_titles where user_id ${uid}`);
    await tx.execute(sql`delete from announcement_poll_votes where user_id ${uid}`);
    await tx.execute(sql`delete from profile_generation_jobs where user_id ${uid}`);
    await tx.execute(sql`delete from user_profiles where user_id ${uid}`);
    await tx.execute(sql`delete from characters where user_id ${uid}`);

    return { users: targets.length, guilds: guilds.length };
  });
}
