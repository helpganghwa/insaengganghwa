// 포인트 지갑 소급(2026-09-08, docs/POINT-SHOP.md) — 오픈 이후 대난투 참가 기록·결제 기록을 point_ledger에 적재하고
// 잔액 컬럼을 원장 합으로 다시 세운다. (kind, ref) 멱등 키라 여러 번 실행해도 안전.
//   실행: bun run scripts/points-backfill.ts [--apply] [DATABASE_URL]   (기본 dry-run·.env.local DATABASE_URL)
//   ⚠ 프로덕션은 URL을 명시(PROD_DATABASE_URL 값)하고 0197 적용 뒤에만.
import postgres from 'postgres';

import { meleePointsForRank, mileageForKrw } from '../lib/game/balance';

const apply = process.argv.includes('--apply');
const url = process.argv.find((a) => a.startsWith('postgres')) ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL 필요');
const sql = postgres(url, { prepare: false, max: 1 });

type MeleeRow = { battle_id: string; user_id: string; final_rank: number; n: number; server_id: number; at: string };
type OrderRow = { id: string; user_id: string; amount_krw: string; product_code: string; paid_at: string; status: string };

async function main() {
  const melee = (await sql`
    select mp.battle_id::text as battle_id, mp.user_id, mp.final_rank, mb.participant_count as n, mb.server_id,
           coalesce(mb.revealed_at, mb.computed_at, mb.created_at) as at
    from melee_participants mp join melee_battles mb on mb.id = mp.battle_id
    where mb.status = 'revealed' and mp.final_rank is not null
      and exists (select 1 from profiles p where p.id = mp.user_id)
  `) as unknown as MeleeRow[];
  const orders = (await sql`
    select id::text as id, user_id, amount_krw::text as amount_krw, product_code, paid_at, status
    from iap_orders where paid_at is not null and status in ('paid', 'refunded')
      and exists (select 1 from profiles p where p.id = iap_orders.user_id)
  `) as unknown as OrderRow[];
  const meleePts = melee.map((r) => ({ ...r, pts: meleePointsForRank(Number(r.final_rank), Number(r.n)) })).filter((r) => r.pts > 0);
  const orderPts = orders.map((o) => ({ ...o, pts: mileageForKrw(Number(o.amount_krw)) })).filter((o) => o.pts > 0);
  console.log(`[backfill] 대난투 ${meleePts.length}건(참가자-전투) · 결제 ${orderPts.length}건(환불 ${orderPts.filter((o) => o.status === 'refunded').length}) · ${apply ? 'APPLY' : 'dry-run'}`);
  if (!apply) {
    const byUser = new Map<string, number>();
    for (const r of meleePts) byUser.set(r.user_id, (byUser.get(r.user_id) ?? 0) + r.pts);
    const top = [...byUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log('[backfill] 대난투 상위 5', top);
    const mile = new Map<string, number>();
    for (const o of orderPts) if (o.status === 'paid') mile.set(o.user_id, (mile.get(o.user_id) ?? 0) + o.pts);
    console.log('[backfill] 마일리지 상위 5', [...mile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5));
    return;
  }
  let ins = 0;
  await sql.begin(async (tx) => {
    for (const r of meleePts) {
      const res = await tx`
        insert into point_ledger (user_id, server_id, kind, delta, note, ref, created_at)
        values (${r.user_id}::uuid, ${r.server_id}, 'melee', ${r.pts}, ${'대난투 ' + r.final_rank + '위'}, ${'melee:' + r.battle_id + ':' + r.user_id}, ${r.at})
        on conflict (kind, ref) where ref is not null do nothing returning id`;
      ins += res.length;
    }
    for (const o of orderPts) {
      const note = `${o.product_code} ₩${Number(o.amount_krw).toLocaleString('ko-KR')}`;
      const res = await tx`
        insert into point_ledger (user_id, server_id, kind, delta, note, ref, created_at)
        values (${o.user_id}::uuid, null, 'mileage', ${o.pts}, ${note}, ${'order:' + o.id}, ${o.paid_at})
        on conflict (kind, ref) where ref is not null do nothing returning id`;
      ins += res.length;
      if (o.status === 'refunded') {
        const r2 = await tx`
          insert into point_ledger (user_id, server_id, kind, delta, note, ref, created_at)
          values (${o.user_id}::uuid, null, 'mileage', ${-o.pts}, '환불 회수', ${'order:' + o.id + ':refund'}, ${o.paid_at})
          on conflict (kind, ref) where ref is not null do nothing returning id`;
        ins += r2.length;
      }
    }
    // 잔액 = 원장 합(캐시 재계산 — 멱등)
    await tx`update characters c set melee_points = coalesce((select sum(delta) from point_ledger l where l.user_id = c.user_id and l.server_id = c.server_id and l.kind = 'melee'), 0)`;
    await tx`update profiles p set mileage = greatest(0, coalesce((select sum(delta) from point_ledger l where l.user_id = p.id and l.kind = 'mileage'), 0))`;
  });
  console.log(`[backfill] 원장 신규 ${ins}행, 잔액 재계산 완료`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
