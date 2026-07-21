import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

import { COMPLETE_BONUS, activeChallenges } from './defs';

/**
 * 도전 과제 달성 판정 — **상태 파생 단일 SQL 1왕복**(CLAUDE §11.4). 각 과제는 기존
 * 테이블 exists로 판정(이벤트형 4종은 challenge_events). 수령 여부는 challenge_claims.
 * 별도 진행 카운터·이벤트 훅 없이 실제 게임 상태가 곧 진실(튜토리얼과 동일 철학).
 */
export type ChallengeStatus = {
  /** 과제 id → 달성 여부. */
  done: Record<string, boolean>;
  /** 수령 완료 과제 id 집합. */
  claimed: Set<string>;
  /** 수령 가능 수(달성 & 미수령, complete 보너스 포함). */
  claimable: number;
  /** 전체 완료 보너스 수령 가능 여부(27종 전부 수령 & 보너스 미수령). */
  completeReady: boolean;
  completeClaimed: boolean;
};

/** 과제별 달성 조건 SQL 조각 — claim 재검증에서도 개별 재사용(단일 진실). */
export function doneCondSql(id: string, userId: string, serverId: number) {
  const u = sql`${userId}::uuid`;
  const s = sql`${serverId}`;
  switch (id) {
    case 'supply_weapon':
      return sql`exists(select 1 from supply_open_logs where user_id=${u} and server_id=${s} and slot='weapon')`;
    case 'supply_armor':
      return sql`exists(select 1 from supply_open_logs where user_id=${u} and server_id=${s} and slot='armor')`;
    case 'supply_accessory':
      return sql`exists(select 1 from supply_open_logs where user_id=${u} and server_id=${s} and slot='accessory')`;
    case 'equip_weapon':
      return sql`exists(select 1 from user_equipment where user_id=${u} and server_id=${s} and equipped_slot='weapon')`;
    case 'equip_armor':
      return sql`exists(select 1 from user_equipment where user_id=${u} and server_id=${s} and equipped_slot='armor')`;
    case 'equip_accessory':
      return sql`exists(select 1 from user_equipment where user_id=${u} and server_id=${s} and equipped_slot='accessory')`;
    case 'enhance_weapon':
      return sql`exists(select 1 from enhancement_jobs where user_id=${u} and server_id=${s} and slot='weapon')`;
    case 'enhance_armor':
      return sql`exists(select 1 from enhancement_jobs where user_id=${u} and server_id=${s} and slot='armor')`;
    case 'enhance_accessory':
      return sql`exists(select 1 from enhancement_jobs where user_id=${u} and server_id=${s} and slot='accessory')`;
    case 'mail_claim':
      return sql`exists(select 1 from mail_claim_logs where user_id=${u} and server_id=${s})`;
    case 'checkin':
      return sql`exists(select 1 from checkin_claim_logs where user_id=${u} and server_id=${s})`;
    case 'transcend':
      return sql`exists(select 1 from transcend_logs where user_id=${u} and server_id=${s})`;
    case 'gem_reduce':
      return sql`exists(select 1 from gem_time_reductions where user_id=${u} and server_id=${s})`;
    case 'push_on':
      // 푸시 구독은 계정 단위(서버 무관).
      return sql`exists(select 1 from push_subscriptions where user_id=${u})`;
    case 'friend':
      return sql`exists(select 1 from friend_links where server_id=${s} and status='accepted' and (requester_id=${u} or addressee_id=${u}))`;
    case 'guild_join':
      return sql`exists(select 1 from guild_members where user_id=${u} and server_id=${s})`;
    case 'guild_donate':
      // 기여도는 기부로 쌓임(GUILD §2.1) — 기여도 보유 = 기부 이력.
      return sql`exists(select 1 from guild_members where user_id=${u} and server_id=${s} and contribution_points > 0)`;
    case 'guild_deploy':
      return sql`exists(select 1 from guild_battle_deployments where user_id=${u} and server_id=${s})`;
    case 'raid_summon':
      return sql`exists(select 1 from raids where host_user_id=${u} and server_id=${s})`;
    case 'raid_attack':
      return sql`exists(select 1 from raid_attacks ra join raids r on r.id=ra.raid_id where ra.user_id=${u} and r.server_id=${s})`;
    case 'raid_reward':
      return sql`exists(select 1 from raid_rewards rr join raids r on r.id=rr.raid_id where rr.user_id=${u} and r.server_id=${s} and rr.claimed_at is not null)`;
    case 'melee_join':
      return sql`exists(select 1 from melee_participants mp join melee_battles mb on mb.id=mp.battle_id where mp.user_id=${u} and mb.server_id=${s})`;
    case 'avatar_create':
      // 생성 시도(잡 존재) 기준 — 결과가 거절·실패(환불)여도 체험은 했으므로 인정(유저 친화).
      return sql`exists(select 1 from profile_generation_jobs where user_id=${u} and server_id=${s})`;
    case 'shop_daily':
      return sql`exists(select 1 from shop_free_claims where user_id=${u} and server_id=${s} and slot='daily')`;
    case 'shop_weekly':
      return sql`exists(select 1 from shop_free_claims where user_id=${u} and server_id=${s} and slot='weekly')`;
    case 'shop_monthly':
      return sql`exists(select 1 from shop_free_claims where user_id=${u} and server_id=${s} and slot='monthly')`;
    case 'chat_send':
      // 마킹 우선 + chat_messages 폴백 — 과제 추가 전에 이미 채팅한 유저 자동 인정
      // (메시지는 7일 보존이라 마킹이 영구 기록, 폴백은 소급 인정용).
      return sql`(exists(select 1 from challenge_events where user_id=${u} and server_id=${s} and event_id='chat_send')
        or exists(select 1 from chat_messages where user_id=${u} and server_id=${s}))`;
    // 이벤트형 — 상태 흔적이 없는 행위(마킹 기반).
    case 'app_install':
    case 'boast_share':
    case 'residence_move':
    case 'avatar_change':
      return sql`exists(select 1 from challenge_events where user_id=${u} and server_id=${s} and event_id=${id})`;
    default:
      return sql`false`;
  }
}

export async function getChallengeStatus(
  userId: string,
  serverId: number,
  hidePaid: boolean,
): Promise<ChallengeStatus> {
  const list = activeChallenges(hidePaid);
  const cols = list.map((c) => sql`${doneCondSql(c.id, userId, serverId)} as ${sql.raw(`"${c.id}"`)}`);
  const rows = (await db.execute(sql`
    select ${sql.join(cols, sql`, `)},
      (select coalesce(json_agg(challenge_id), '[]'::json)
         from challenge_claims where user_id=${userId}::uuid and server_id=${serverId}) as claimed
  `)) as unknown as (Record<string, boolean> & { claimed: string[] })[];
  const row = rows[0]!;

  const done: Record<string, boolean> = {};
  for (const c of list) done[c.id] = !!row[c.id];
  const claimed = new Set<string>(row.claimed ?? []);

  const allClaimed = list.every((c) => claimed.has(c.id));
  const completeClaimed = claimed.has(COMPLETE_BONUS.id);
  const completeReady = allClaimed && !completeClaimed;
  const claimable =
    list.filter((c) => done[c.id] && !claimed.has(c.id)).length + (completeReady ? 1 : 0);

  return { done, claimed, claimable, completeReady, completeClaimed };
}

/** 홈 카드 뱃지용 — 수령 가능 수만(가벼운 동일 쿼리 재사용). */
export async function countClaimableChallenges(
  userId: string,
  serverId: number,
  hidePaid: boolean,
): Promise<number> {
  const s = await getChallengeStatus(userId, serverId, hidePaid);
  return s.claimable;
}
