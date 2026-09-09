import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { FIRST_MILESTONES, type FirstMilestoneMetric } from '@/lib/game/balance';

/**
 * 최초 이정표 기록(2026-09-09, docs/TITLES.md) — 서버에서 이정표를 **처음 넘은 세 사람**을 순서대로 남긴다(금·은·동).
 * 칭호 first_<이정표>_<rank>의 판정 정본(judge.ts fr_* 지표)이며 우편·공지 없음("기록 칭호만", 사용자 확정).
 *
 *  - 호출: 리더보드 증분 갱신(refreshEnhanceMetrics)이 max·sum·combat·최고 초월을 구한 뒤 커밋 밖에서 best-effort.
 *    강화 정산·보급 개봉(자동 초월)이 그 경로를 타므로 네 축 전부 여기서 잡힌다. 놓친 호출은 다음 갱신이 잡는다
 *    (값은 단조 증가가 아니어도 임계 이상이면 매번 시도 — 이미 기록된 유저는 unique로 멱등).
 *  - 직렬화: 이정표별 advisory 락(pg_advisory_xact_lock) 안에서 count → insert. 동시 도달 둘이 같은 rank를 계산하는
 *    경쟁을 락이 없앤다. 넷째부터는 rank 4 → check 위반 대신 미리 건너뛴다.
 *  - 소급 없음: 배포 시점에 이미 임계를 넘긴 사람이 있으면 그 사람의 다음 갱신에서 1등으로 기록된다. 그래서 임계는
 *    항상 **현재 1위보다 높게** 잡는다(09-09 기준 최고 강화 460 · 전투력 498만 · 초월 17 · 합산 15,940).
 */
type Runner = Pick<typeof db, 'transaction'>;

export type FirstMilestoneValues = Partial<Record<FirstMilestoneMetric, number>>;

/** 임계 이상인 이정표만 골라 순서대로 기록. 반환 = 이번 호출로 새로 기록된 [milestone, rank]. */
export async function recordFirstMilestones(
  userId: string,
  serverId: number,
  values: FirstMilestoneValues,
  runner: Runner = db,
): Promise<[string, number][]> {
  const hit = FIRST_MILESTONES.filter((m) => (values[m.metric] ?? 0) >= m.value);
  if (hit.length === 0) return [];
  return runner.transaction(async (tx) => {
    const out: [string, number][] = [];
    for (const m of hit) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'mf:' + serverId + ':' + m.key}, 0))`);
      const [row] = (await tx.execute(sql`
        select coalesce(max(rank), 0)::int as top,
               bool_or(user_id = ${userId}::uuid) as mine
        from milestone_firsts where server_id = ${serverId} and milestone = ${m.key}
      `)) as unknown as { top: number; mine: boolean | null }[];
      if (row?.mine) continue; // 이미 기록된 유저 — 멱등
      const rank = Number(row?.top ?? 0) + 1;
      if (rank > 3) continue; // 세 자리 다 참
      await tx.execute(sql`
        insert into milestone_firsts (server_id, milestone, rank, user_id)
        values (${serverId}, ${m.key}, ${rank}, ${userId}::uuid)
      `);
      out.push([m.key, rank]);
    }
    return out;
  });
}

/** 유저의 이정표 순위 — judge.ts 지표(fr_<key> = 1~3, 없으면 0). */
export async function loadFirstRanks(userId: string, serverId: number, runner: Pick<typeof db, 'execute'> = db): Promise<Record<string, number>> {
  const rows = (await runner.execute(sql`
    select milestone, rank from milestone_firsts where user_id = ${userId}::uuid and server_id = ${serverId}
  `)) as unknown as { milestone: string; rank: unknown }[];
  const out: Record<string, number> = {};
  for (const m of FIRST_MILESTONES) out['fr_' + m.key] = 0;
  for (const r of rows) out['fr_' + r.milestone] = Number(r.rank);
  return out;
}
