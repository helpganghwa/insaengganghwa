import 'server-only';

/**
 * 개인 월드보스(0253) 정산 — 보스가 사라질 때(settleOne 안, 보스 행을 잠근 트랜잭션) 최고 기록으로 순위를 매기고
 * 구간(+ 최종 페이즈 보너스) + 순위 보상을 기록 행에 적은 뒤 참가자 모두에게 결과 우편을 보낸다. 동점은 먼저 세운 사람이 위.
 */
import { sql } from 'drizzle-orm';
import { josa } from 'josa';

import type { db } from '@/lib/db/client';

import { soloPhaseBonus, soloRankReward, soloTierReward, SOLO_TIERS } from './solo';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const fmt = (n: number) => n.toLocaleString('ko-KR');

export type SoloSettleLine = { userId: string; best: number; rank: number; diamond: number; boxes: number; tier: number };

/** 순수 계산 — 테스트 대상. rows는 best desc, best_at asc 순. */
export function soloSettleLines(rows: { userId: string; best: number }[], stage: number): SoloSettleLine[] {
  return rows.map((r, i) => {
    const rank = i + 1;
    const t = soloTierReward(r.best, stage);
    const k = soloRankReward(rank);
    return { userId: r.userId, best: r.best, rank, tier: t.tier, diamond: t.diamond + k.diamond, boxes: t.boxes + k.boxes };
  });
}

export async function settleSoloBoss(tx: Tx, input: { serverId: number; bossId: string; bossName: string; zoneName: string; stage: number; leavePolite: string }): Promise<number> {
  const rows = (await tx.execute(sql`
    select user_id::text as uid, best::text as best from world_boss_solo_records
     where boss_id = ${input.bossId}::bigint order by best desc, best_at asc, user_id`)) as unknown as { uid: string; best: string }[];
  if (rows.length === 0) return 0;
  const lines = soloSettleLines(rows.map((r) => ({ userId: r.uid, best: Number(r.best) })), input.stage);
  const bonusPct = Math.round((soloPhaseBonus(input.stage) - 1) * 100);
  // 500명씩 나눠 쓴다(값 목록이 너무 길어지지 않게).
  for (let i = 0; i < lines.length; i += 500) {
    const chunk = lines.slice(i, i + 500);
    await tx.execute(sql`
      update world_boss_solo_records r set final_rank = v.rk, reward_diamond = v.dia, reward_boxes = v.box
        from (values ${sql.join(chunk.map((l) => sql`(${l.userId}::uuid, ${l.rank}::int, ${l.diamond}::int, ${l.boxes}::int)`), sql`, `)}) as v(uid, rk, dia, box)
       where r.boss_id = ${input.bossId}::bigint and r.user_id = v.uid`);
    await tx.execute(sql`
      insert into mailbox (user_id, server_id, type, title, body, sender_label, payload, expires_at)
      values ${sql.join(
        chunk.map((l) => {
          const per = Math.floor(l.boxes / 3);
          const payload = JSON.stringify({ diamond: l.diamond, boxes: { weapon: per, armor: per, accessory: per } });
          const tier = SOLO_TIERS[l.tier]!;
          const body = josa(
            `${input.zoneName}의 ${input.bossName}#{이} ${input.leavePolite}.\n` +
              `내 최고 기록 ${fmt(l.best)} · 최종 ${fmt(l.rank)}위\n` +
              `${tier.min === 0 ? '참가' : `${tier.label} 구간`} 보상에 페이즈 보너스 +${bonusPct}%(${fmt(input.stage)}페이즈 돌파)가 더해졌어요.` +
              (l.rank <= 30 ? `\n${fmt(l.rank)}위 순위 보상도 함께 담았어요.` : ''),
          );
          return sql`(${l.userId}::uuid, ${input.serverId}, 'world_boss'::mailbox_type, ${`${input.bossName} 결과`}, ${body}, '월드보스', ${payload}::jsonb, now() + interval '30 days')`;
        }),
        sql`, `,
      )}`);
  }
  return lines.length;
}
