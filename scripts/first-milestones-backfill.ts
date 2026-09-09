// 최초 이정표 소급(2026-09-09, docs/TITLES.md "최초 이정표 칭호") — 배포 시점에 이미 임계를 넘긴 유저를 **실제 넘은 순서대로**
// milestone_firsts에 넣는다. 라이브 훅(recordFirstMilestones)은 배포 뒤 활동 순서로 기록하므로, 배포 전에 넘긴 사람이 둘 이상이면
// 순서가 어긋난다 — 그래서 코드 배포 **전에** 이 스크립트를 돌린다.
//   실행: bun run scripts/first-milestones-backfill.ts [--apply] [DATABASE_URL]   (기본 dry-run · .env.local DATABASE_URL)
//   순서: 0198 적용 → 이 스크립트 --apply → 코드 배포. 프로덕션은 URL을 명시(PROD_DATABASE_URL 값).
// 순서 복원:
//   - 강화(enh*): enhancement_logs에서 to_level ≥ 임계인 첫 시각(정확).
//   - 초월(t*): transcend_logs에서 to_t ≥ 임계인 첫 시각(정확).
//   - 합산·전투력(sum*·combat*): 시각 이력이 없어 현재 값이 임계 이상인 유저만 골라 강화·초월 로그를 **재생**해 처음 넘은 시각을 구한다.
//     교체된 장비(현재 미보유 카탈로그)의 로그는 빼고, 로그의 from_level이 추적값과 다르면 from_level로 맞춘다(이관 레벨).
//     재생으로 못 찾으면 leaderboard_ranks.updated_at을 쓰고 '추정'으로 표시한다 — 이 경우는 사람이 확인할 것.
//   - 이미 행이 있는 (서버, 이정표)는 건너뛰고 차이만 보여 준다(재실행 안전).
import postgres from 'postgres';

import { FIRST_MILESTONES } from '@/lib/game/balance';
import { combatPowerFromOwned } from '@/lib/game/equipment/combat-power';

const apply = process.argv.includes('--apply');
const url = process.argv.find((a) => a.startsWith('postgres')) ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL 필요');
const sql = postgres(url, { prepare: false, max: 1 });

type Hit = { userId: string; at: Date; how: string };

async function nick(userId: string, serverId: number): Promise<string> {
  const [r] = await sql`select nickname from characters where user_id = ${userId}::uuid and server_id = ${serverId}`;
  return r?.nickname ?? userId.slice(0, 8);
}

async function fromLogs(table: 'enhancement_logs' | 'transcend_logs', col: 'to_level' | 'to_t', serverId: number, value: number): Promise<Hit[]> {
  const rows = await sql.unsafe(
    `select user_id::text as user_id, min(created_at) as at from ${table} where server_id = $1 and ${col} >= $2 group by user_id order by at asc limit 3`,
    [serverId, value],
  );
  return rows.map((r) => ({ userId: r.user_id as string, at: new Date(r.at as string), how: table }));
}

/** 합산·전투력 — 현재 값이 임계 이상인 유저만 로그 재생. */
async function fromReplay(metric: 'sum' | 'combat', serverId: number, value: number): Promise<Hit[]> {
  const cands = await sql`
    select user_id::text as user_id, value::bigint as value, updated_at from leaderboard_ranks
    where server_id = ${serverId} and metric = ${metric} and value >= ${value}`;
  const out: Hit[] = [];
  for (const c of cands) {
    const uid = c.user_id as string;
    const owned = await sql`select catalog_item_id from user_equipment where user_id = ${uid}::uuid and server_id = ${serverId}`;
    const ownedIds = new Set(owned.map((o) => Number(o.catalog_item_id)));
    const ev = await sql`
      select 'e' as k, catalog_item_id, from_level as a, to_level as b, created_at from enhancement_logs where user_id = ${uid}::uuid and server_id = ${serverId}
      union all
      select 't' as k, catalog_item_id, null as a, to_t as b, created_at from transcend_logs where user_id = ${uid}::uuid and server_id = ${serverId}
      order by created_at asc`;
    const st = new Map<number, { catalogItemId: number; enhanceLevel: number; transcendLevel: number }>();
    let found: Date | null = null;
    for (const e of ev) {
      const cid = Number(e.catalog_item_id);
      if (!ownedIds.has(cid)) continue; // 교체로 사라진 장비 — 현재 값에 없다
      const s = st.get(cid) ?? { catalogItemId: cid, enhanceLevel: 0, transcendLevel: 0 };
      if (e.k === 'e') {
        if (e.a !== null && Number(e.a) !== s.enhanceLevel) s.enhanceLevel = Number(e.a); // 이관 레벨 등 추적 어긋남 보정
        s.enhanceLevel = Number(e.b);
      } else s.transcendLevel = Number(e.b);
      st.set(cid, s);
      const rows = [...st.values()];
      const v = metric === 'sum' ? rows.reduce((a, r) => a + r.enhanceLevel, 0) : Math.round(combatPowerFromOwned(rows));
      if (v >= value) {
        found = new Date(e.created_at as string);
        break;
      }
    }
    out.push({ userId: uid, at: found ?? new Date(c.updated_at as string), how: found ? 'replay' : '추정(leaderboard.updated_at)' });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 3);
}

async function main(): Promise<void> {
  const servers = (await sql`select distinct server_id from characters order by 1`).map((r) => Number(r.server_id));
  const [tbl] = await sql`select to_regclass('public.milestone_firsts') as t`;
  const hasTable = !!tbl?.t;
  if (apply && !hasTable) throw new Error('milestone_firsts 없음 — 0198을 먼저 적용');
  console.log(`[first-backfill] ${apply ? 'APPLY' : 'dry-run'} · 서버 ${servers.join(',')}${hasTable ? '' : ' · (0198 미적용: 기존 행 검사 생략)'}`);
  let planned = 0;
  for (const serverId of servers) {
    for (const m of FIRST_MILESTONES) {
      const existing = hasTable ? await sql`select rank, user_id::text as user_id from milestone_firsts where server_id = ${serverId} and milestone = ${m.key} order by rank` : [];
      let hits: Hit[];
      if (m.metric === 'max') hits = await fromLogs('enhancement_logs', 'to_level', serverId, m.value);
      else if (m.metric === 'transcend') hits = await fromLogs('transcend_logs', 'to_t', serverId, m.value);
      else hits = await fromReplay(m.metric, serverId, m.value);
      if (hits.length === 0) continue;
      const lines = await Promise.all(hits.map(async (h, i) => `    ${i + 1}등 ${await nick(h.userId, serverId)} ${h.at.toISOString()} (${h.how})`));
      console.log(`  s${serverId} ${m.key}(${m.metric} ≥ ${m.value.toLocaleString()})`);
      console.log(lines.join('\n'));
      if (existing.length) {
        console.log(`    ↳ 이미 기록 ${existing.length}행 있음 — 건너뜀: ${existing.map((e) => `${e.rank}등 ${String(e.user_id).slice(0, 8)}`).join(', ')}`);
        continue;
      }
      planned += hits.length;
      if (apply) {
        await sql.begin(async (tx) => {
          for (let i = 0; i < hits.length; i++) {
            await tx`insert into milestone_firsts (server_id, milestone, rank, user_id, reached_at) values (${serverId}, ${m.key}, ${i + 1}, ${hits[i]!.userId}::uuid, ${hits[i]!.at})`;
          }
        });
        console.log(`    ↳ 기록 ${hits.length}행`);
      }
    }
  }
  console.log(`[first-backfill] ${apply ? '기록' : '예정'} ${planned}행`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
