// 스테이징 테스트 수치 원복(2026-07-16 1회성) — 티커 테스트로 과장한 leaderboard/오늘 스냅샷을
// 실측(장비 기반)으로 재계산해 되돌린다. 과거 30일 더미 히스토리는 그래프 검토용으로 유지.
import { config } from 'dotenv';
import postgres from 'postgres';

import { pieceCombatPower } from '@/lib/game/balance';

config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

const users = await sql`select distinct user_id::text uid, server_id from user_equipment`;
type Row = { uid: string; server: number; combat: number; mx: number; sm: number };
const rows: Row[] = [];
for (const u of users) {
  const eq = await sql`select catalog_item_id cid, enhance_level lv, transcend_level t
    from user_equipment where user_id = ${u.uid}::uuid and server_id = ${u.server_id}`;
  const best = new Map<number, number>();
  let mx = 0, sm = 0;
  for (const e of eq) {
    const cp = pieceCombatPower(Number(e.lv), Number(e.t));
    if ((best.get(e.cid) ?? -1) < cp) best.set(e.cid, cp);
    mx = Math.max(mx, Number(e.lv));
    sm += Number(e.lv);
  }
  const combat = [...best.values()].reduce((a, b) => a + b, 0);
  rows.push({ uid: u.uid, server: u.server_id, combat, mx, sm });
  for (const [metric, v] of [['combat', combat], ['max', mx], ['sum', sm]] as const) {
    await sql`update leaderboard_ranks set value = ${v}
      where user_id = ${u.uid}::uuid and server_id = ${u.server_id} and metric = ${metric}`;
  }
}
// 오늘 스냅샷도 실측 기준으로 재작성(랭크 포함) — 내일부터는 자정 크론이 정상 기록.
const byServer = new Map<number, Row[]>();
for (const r of rows) byServer.set(r.server, [...(byServer.get(r.server) ?? []), r]);
for (const [server, list] of byServer) {
  const rank = (key: 'combat' | 'mx' | 'sm') => {
    const order = [...list].sort((a, b) => b[key] - a[key]);
    return new Map(order.map((r, i) => [r.uid, i + 1]));
  };
  const rc = rank('combat'), rm = rank('mx'), rs = rank('sm');
  for (const r of list) {
    await sql`update user_daily_stats
      set combat = ${r.combat}, max_enhance = ${r.mx}, sum_enhance = ${r.sm},
          combat_rank = ${rc.get(r.uid) ?? null}, max_rank = ${rm.get(r.uid) ?? null}, sum_rank = ${rs.get(r.uid) ?? null}
      where user_id = ${r.uid}::uuid and server_id = ${server}
        and kst_day = (now() at time zone 'Asia/Seoul')::date`;
  }
}
console.log(`원복 완료 — ${rows.length}명 재계산`);
for (const r of rows) console.log(`  ${r.uid.slice(0, 8)} combat=${r.combat} max=${r.mx} sum=${r.sm}`);
await sql.end();
