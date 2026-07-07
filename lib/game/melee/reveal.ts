import 'server-only';

import { and, eq, inArray, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { meleeBattles, meleeParticipants } from '@/lib/db/schema/melee';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { sendPushToUsers } from '@/lib/push/send';
import { logMemberAchievement } from '@/lib/game/guild/achievement';
import { logWorldEvent } from '@/lib/game/world/event';
import { bumpCountMetric } from '@/lib/game/leaderboard/incremental';

/**
 * 대난투 10:00 발표 — MELEE §7. KST 오늘 배틀이 'computed'면:
 *  status='revealed'(조건부·멱등) → 참가자 전원 결과 우편(reward, 다이아+상자) + 푸시.
 * 우편/푸시 본문 = "오늘 대난투 N위!" + 시상대 Top3(🥇🥈🥉 닉). 발표 전엔 결과 API 비공개.
 *
 * 우편 적재는 단일 SQL(insert…select from melee_participants)로 N행 한 번에 — DB측 처리.
 * 푸시는 sendPushToUsers(배치, 동일 본문·시상대, 토글 OFF 자동 스킵). 초대규모는 청크 필요.
 */
export async function revealMelee(serverId: number): Promise<{ revealed: number; mailed: number; battleIds: string[] }> {
  const [today] = (await db.execute(
    sql`select (now() at time zone 'Asia/Seoul')::date::text d`,
  )) as unknown as { d: string }[];

  // 백스톱 스캔 — 오늘뿐 아니라 과거의 미발표('computed') 배틀도 함께 쓸어담는다.
  // 발표 윈도(KST 10시대 12틱)가 장애로 전량 실패하면, 실행 시각 파생 날짜만 보는 구조에선
  // 그 배틀이 영영 미발표로 남아 참가자 보상 우편이 영구 유실된다(감사 M-2).
  const pending = await db
    .select({ d: meleeBattles.battleDate })
    .from(meleeBattles)
    .where(
      and(
        eq(meleeBattles.serverId, serverId),
        eq(meleeBattles.status, 'computed'),
        lte(meleeBattles.battleDate, today!.d),
      ),
    )
    .orderBy(meleeBattles.battleDate);

  let mailed = 0;
  const battleIds: string[] = [];
  for (const p of pending) {
    const r = await revealOne(serverId, p.d);
    if (r) {
      mailed += r.mailed;
      battleIds.push(r.battleId);
    }
  }
  return { revealed: battleIds.length, mailed, battleIds };
}

/** (server, battleDate) 배틀 1건 발표 — 조건부 플립 + 우편 + 푸시 + 업적/피드. */
async function revealOne(serverId: number, battleDate: string): Promise<{ battleId: string; mailed: number } | null> {
  const RANK_LABEL = ['🏆우승', '2등', '3등'];

  // 트랜잭션 — 상태 플립(computed→revealed, 멱등) + 시상대 조회 + 참가자 결과 우편 일괄 적재를
  // 원자적으로 처리(감사 M1). 플립만 커밋되고 우편 적재 전에 중단되면, 재시도 시 이미 revealed라
  // 0행 조기종료 → 보상 우편이 영영 유실되던 문제 방지. 중단 시 롤백되어 재시도가 둘 다 재수행.
  const result = await db.transaction(async (tx) => {
    const flipped = await tx
      .update(meleeBattles)
      .set({ status: 'revealed', revealedAt: new Date() })
      .where(
        and(
          eq(meleeBattles.serverId, serverId),
          eq(meleeBattles.battleDate, battleDate),
          eq(meleeBattles.status, 'computed'),
        ),
      )
      .returning({ id: meleeBattles.id, championUserId: meleeBattles.championUserId });
    if (flipped.length === 0) return null;
    const battleId = flipped[0]!.id;
    const championUserId = flipped[0]!.championUserId;

    // 시상대 Top3(1·2·3위) — 우편/푸시 공통 본문. 참가자 적으면 있는 만큼만(🥇 폴백).
    const podium = await tx
      .select({ rank: meleeParticipants.finalRank, nick: characters.nickname, userId: meleeParticipants.userId })
      .from(meleeParticipants)
      .innerJoin(
        characters,
        and(eq(characters.userId, meleeParticipants.userId), eq(characters.serverId, serverId)),
      )
      .where(and(eq(meleeParticipants.battleId, battleId), inArray(meleeParticipants.finalRank, [1, 2, 3])))
      .orderBy(meleeParticipants.finalRank);
    const podiumStr =
      podium.length > 0
        ? podium.map((p) => `${RANK_LABEL[p.rank - 1] ?? `${p.rank}위`} ${p.nick}`).join(' · ')
        : '🏆우승 챔피언';

    // 결과 우편 — 참가자 전원 1행씩 DB측 일괄 적재(melee type, 다이아+상자 payload).
    await tx.execute(sql`
      insert into mailbox (user_id, server_id, type, title, body, sender_label, payload, expires_at)
      select mp.user_id,
             ${serverId},
             'melee'::mailbox_type,
             '대난투 결과',
             '오늘 대난투 ' || mp.final_rank || '위!' || E'\n' || ${podiumStr},
             '대난투',
             jsonb_build_object('diamond', mp.reward_diamond, 'boxes', mp.reward_boxes),
             now() + interval '30 days'
      from melee_participants mp
      where mp.battle_id = ${battleId}
    `);
    return { battleId, podium, podiumStr, championUserId };
  });

  if (!result) return null;
  const { battleId, podium, podiumStr } = result;

  // 리더보드 증분(v2) — 통산 우승 +1. reveal이 조건부 전이로 정확히 1회라 증분이 정확.
  if (result.championUserId) {
    // await — 서버리스는 응답 종료 시 미완 프라미스를 드롭할 수 있어 fire-and-forget 금지.
    await bumpCountMetric([result.championUserId], serverId, 'melee').catch((e) =>
      console.warn('[melee.reveal] leaderboard bump failed (cron이 교정)', e),
    );
  }

  // 푸시 — 참가자 전원(토글 ON만 내부 필터). 본문은 시상대 Top3(개인 순위는 우편/페이지).
  // 경계규칙 1 — 발송은 활성 서버(last_server_id) 참가자에게만(타 서버 푸시 억제).
  const parts = await db
    .select({ uid: meleeParticipants.userId })
    .from(meleeParticipants)
    .innerJoin(profiles, eq(profiles.id, meleeParticipants.userId))
    .where(and(eq(meleeParticipants.battleId, battleId), eq(profiles.lastServerId, serverId)));
  const userIds = parts.map((p) => p.uid);
  await sendPushToUsers(userIds, {
    title: '대난투 결과 발표',
    body: `${podiumStr} · 내 순위 확인하기`,
    url: '/melee',
    tag: 'melee',
    category: 'melee',
  }).catch((e) => console.warn('[melee.reveal] push failed', e));

  // 길드 업적(길드원) + 월드 피드(전체) — 대난투 1~3위 노출(best-effort). 각 호출을 try/catch로
  // 격리(감사 B8): 1건 throw 시 나머지 등수·함수 전체가 죽어, 멱등 reveal 재시도가 no-op이 되며
  // 업적/피드가 영구 누락되던 문제 방지(우편·푸시는 이미 완료). 실패는 흡수.
  for (const p of podium) {
    if (p.rank >= 1 && p.rank <= 3) {
      try {
        await logMemberAchievement(p.userId, serverId, { action: 'achv_melee', detail: { rank: p.rank } });
        await logWorldEvent(serverId, 'melee_rank', { rank: p.rank }, { actorUserId: p.userId });
      } catch (e) {
        console.warn('[melee.reveal] achievement/feed failed', p.userId, (e as Error).message);
      }
    }
  }

  return { battleId: battleId.toString(), mailed: userIds.length };
}
