import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { meleeBattles, meleeParticipants } from '@/lib/db/schema/melee';
import { profiles } from '@/lib/db/schema/profiles';
import { sendPushToUsers } from '@/lib/push/send';

/**
 * 대난투 10:00 발표 — MELEE §7. KST 오늘 배틀이 'computed'면:
 *  status='revealed'(조건부·멱등) → 참가자 전원 결과 우편(reward, 다이아+상자) + 푸시.
 * 우편/푸시 본문 = "오늘 대난투 N위!" + 시상대 Top3(🥇🥈🥉 닉). 발표 전엔 결과 API 비공개.
 *
 * 우편 적재는 단일 SQL(insert…select from melee_participants)로 N행 한 번에 — DB측 처리.
 * 푸시는 sendPushToUsers(배치, 동일 본문·시상대, 토글 OFF 자동 스킵). 초대규모는 청크 필요.
 */
export async function revealMelee(): Promise<{ revealed: boolean; battleId?: string; mailed?: number }> {
  const [today] = (await db.execute(
    sql`select (now() at time zone 'Asia/Seoul')::date::text d`,
  )) as unknown as { d: string }[];
  const battleDate = today!.d;

  // computed → revealed 조건부 전이(멱등 — 이미 revealed면 0행).
  const flipped = await db
    .update(meleeBattles)
    .set({ status: 'revealed', revealedAt: new Date() })
    .where(and(eq(meleeBattles.battleDate, battleDate), eq(meleeBattles.status, 'computed')))
    .returning({ id: meleeBattles.id, champ: meleeBattles.championUserId });
  if (flipped.length === 0) return { revealed: false };

  const battleId = flipped[0]!.id;

  // 시상대 Top3(1·2·3위) — 우편/푸시 공통 본문. 참가자 적으면 있는 만큼만(🥇 폴백).
  const podium = await db
    .select({ rank: meleeParticipants.finalRank, nick: profiles.nickname })
    .from(meleeParticipants)
    .innerJoin(profiles, eq(profiles.id, meleeParticipants.userId))
    .where(and(eq(meleeParticipants.battleId, battleId), inArray(meleeParticipants.finalRank, [1, 2, 3])))
    .orderBy(meleeParticipants.finalRank);
  const RANK_LABEL = ['🏆우승', '2등', '3등'];
  const podiumStr =
    podium.length > 0
      ? podium.map((p) => `${RANK_LABEL[p.rank - 1] ?? `${p.rank}위`} ${p.nick}`).join(' · ')
      : '🏆우승 챔피언';

  // 결과 우편 — 참가자 전원 1행씩 DB측 일괄 적재(reward type, 다이아+상자 payload).
  await db.execute(sql`
    insert into mailbox (user_id, type, title, body, sender_label, payload, expires_at)
    select mp.user_id,
           'reward'::mailbox_type,
           '대난투 결과',
           '오늘 대난투 ' || mp.final_rank || '위!' || E'\n' || ${podiumStr},
           '대난투',
           jsonb_build_object('diamond', mp.reward_diamond::text, 'boxes', mp.reward_boxes),
           now() + interval '7 days'
    from melee_participants mp
    where mp.battle_id = ${battleId}
  `);

  // 푸시 — 참가자 전원(토글 ON만 내부 필터). 본문은 시상대 Top3(개인 순위는 우편/페이지).
  const parts = await db
    .select({ uid: meleeParticipants.userId })
    .from(meleeParticipants)
    .where(eq(meleeParticipants.battleId, battleId));
  const userIds = parts.map((p) => p.uid);
  await sendPushToUsers(userIds, {
    title: '대난투 결과 발표',
    body: `${podiumStr} · 내 순위 확인하기`,
    url: '/melee',
    tag: 'melee',
    category: 'melee',
  }).catch((e) => console.warn('[melee.reveal] push failed', e));

  return { revealed: true, battleId: battleId.toString(), mailed: userIds.length };
}
