// 포인트 지갑 소급·복구(docs/POINT-SHOP.md) — 대난투 참가 기록·결제 기록을 point_ledger에 적재하고 잔액을 원장
// 합으로 다시 세운다. (kind, ref) 멱등 키라 여러 번 실행해도 안전.
// 실시간 적립(대난투 발표·결제 완료)은 실패해도 본 흐름을 막지 않게 되어 있어, **빠진 적립을 채우는 수단이 이것뿐**이다.
// 마일리지는 서버별(0211) — 원장 행은 그 주문의 서버를 달고, 잔액은 mileage_wallets에 세운다.
//   실행: bun run scripts/points-backfill.ts [--apply] [--server=N] [DATABASE_URL]   (기본 dry-run·.env.local DATABASE_URL)
//   --server=N  그 서버만 처리한다(적재·잔액 재계산 모두). 생략하면 전 서버. 한 서버에서만 적립이 빠졌을 때
//               다른 서버의 잔액 행까지 잠그지 않으려고 둔다. 실행하면 먼저 그 DB의 서버 목록을 보여 준다.
//   ⚠ 프로덕션은 URL을 명시(PROD_DATABASE_URL 값)하고 0197·0211 적용 뒤에만.
import postgres from 'postgres';
import { meleePointsForRank, mileageForKrw } from '../lib/game/balance';
import { paidProduct } from '../lib/game/shop/catalog';

/** 상품 표시명 — lib/payment/purchase.ts productDisplayName과 같은 규칙(그쪽은 server-only 체인이라 여기서 복제). */
const BP_RE = /^bp_(enhance|transcend)_(\d+)$/;
function displayName(code: string): string {
  const m = BP_RE.exec(code);
  if (m) return `성장 ${m[1] === 'enhance' ? '강화' : '초월'} 패스 ${Number(m[2]) + 1}구간`;
  return paidProduct(code)?.orderName ?? code;
}

const apply = process.argv.includes('--apply');
const srvArg = process.argv.find((a) => a.startsWith('--server='))?.slice('--server='.length);
/** 대상 서버 — null이면 전 서버. */
const srv: number | null = srvArg == null ? null : Number(srvArg);
if (srv !== null && !(Number.isInteger(srv) && srv >= 1 && srv <= 32767)) {
  throw new Error(`--server 값이 올바르지 않습니다: ${srvArg}`);
}
const url = process.argv.find((a) => a.startsWith('postgres')) ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL 필요');
const sql = postgres(url, { prepare: false, max: 1 });

type MeleeRow = { battle_id: string; user_id: string; final_rank: number; n: number; server_id: number; at: string };
type OrderRow = { id: string; user_id: string; server_id: number; amount_krw: string; product_code: string; paid_at: string; status: string };

async function main() {
  // 붙은 DB가 맞는지 눈으로 확인 — 서버 목록을 먼저 보여 주고, 지정한 서버가 없으면 멈춘다.
  const serverRows = (await sql`select id, name, status from servers order by id`) as unknown as { id: number; name: string; status: string }[];
  console.log(`[backfill] 서버: ${serverRows.map((r) => `${r.id}=${r.name}(${r.status})`).join(', ')} · 대상 = ${srv === null ? '전 서버' : `${srv}서버`}`);
  if (srv !== null && !serverRows.some((r) => Number(r.id) === srv)) throw new Error(`${srv}서버가 이 DB에 없습니다`);
  const meleeSrv = srv === null ? sql`` : sql`and mb.server_id = ${srv}`;
  const orderSrv = srv === null ? sql`` : sql`and iap_orders.server_id = ${srv}`;

  const melee = (await sql`
    select mp.battle_id::text as battle_id, mp.user_id, mp.final_rank, mb.participant_count as n, mb.server_id,
           coalesce(mb.revealed_at, mb.computed_at, mb.created_at) as at
    from melee_participants mp join melee_battles mb on mb.id = mp.battle_id
    where mb.status = 'revealed' and mp.final_rank is not null
      and exists (select 1 from profiles p where p.id = mp.user_id)
      ${meleeSrv}
  `) as unknown as MeleeRow[];
  const orders = (await sql`
    select id::text as id, user_id, server_id, amount_krw::text as amount_krw, product_code, paid_at, status
    from iap_orders where paid_at is not null and status in ('paid', 'refunded')
      and exists (select 1 from profiles p where p.id = iap_orders.user_id)
      ${orderSrv}
  `) as unknown as OrderRow[];
  const meleePts = melee.map((r) => ({ ...r, pts: meleePointsForRank(Number(r.final_rank), Number(r.n)) })).filter((r) => r.pts > 0);
  const orderPts = orders.map((o) => ({ ...o, pts: mileageForKrw(Number(o.amount_krw)) })).filter((o) => o.pts > 0);
  console.log(`[backfill] 대난투 ${meleePts.length}건(참가자-전투) · 결제 ${orderPts.length}건(환불 ${orderPts.filter((o) => o.status === 'refunded').length}) · ${apply ? 'APPLY' : 'dry-run'}`);
  // 서버별 건수·점수 — 어느 서버에 얼마가 걸려 있는지.
  const perServer = new Map<number, { melee: number; meleePts: number; orders: number; mileage: number }>();
  const slot = (sid: number) => perServer.get(sid) ?? perServer.set(sid, { melee: 0, meleePts: 0, orders: 0, mileage: 0 }).get(sid)!;
  for (const r of meleePts) { const t = slot(Number(r.server_id)); t.melee++; t.meleePts += r.pts; }
  for (const o of orderPts) { const t = slot(Number(o.server_id)); t.orders++; if (o.status === 'paid') t.mileage += o.pts; }
  for (const [sid, t] of [...perServer.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`[backfill]   ${sid}서버 — 대난투 ${t.melee}건 ${t.meleePts}점 · 결제 ${t.orders}건 마일리지 ${t.mileage}점`);
  }
  if (!apply) {
    const byUser = new Map<string, number>();
    for (const r of meleePts) {
      const k = `${r.user_id}@s${r.server_id}`; // 대난투 포인트는 서버별 잔액
      byUser.set(k, (byUser.get(k) ?? 0) + r.pts);
    }
    const top = [...byUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log('[backfill] 대난투 상위 5', top);
    const mile = new Map<string, number>();
    for (const o of orderPts) {
      const k = `${o.user_id}@s${o.server_id}`;
      if (o.status === 'paid') mile.set(k, (mile.get(k) ?? 0) + o.pts);
    }
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
      const note = `${displayName(o.product_code)} ₩${Number(o.amount_krw).toLocaleString('ko-KR')}`;
      const res = await tx`
        insert into point_ledger (user_id, server_id, kind, delta, note, ref, created_at)
        values (${o.user_id}::uuid, ${o.server_id}, 'mileage', ${o.pts}, ${note}, ${'order:' + o.id}, ${o.paid_at})
        on conflict (kind, ref) where ref is not null do nothing returning id`;
      ins += res.length;
      if (o.status === 'refunded') {
        const r2 = await tx`
          insert into point_ledger (user_id, server_id, kind, delta, note, ref, created_at)
          values (${o.user_id}::uuid, ${o.server_id}, 'mileage', ${-o.pts}, '환불 회수', ${'order:' + o.id + ':refund'}, ${o.paid_at})
          on conflict (kind, ref) where ref is not null do nothing returning id`;
        ins += r2.length;
      }
    }
    // 잔액 = 원장 합(캐시 재계산 — 멱등). 원장이 있는 행만, 값이 다를 때만(점검 반영: 전 행 UPDATE는 두 테이블을
    // 통째로 잠그고, 문장 스냅샷 뒤에 커밋된 실시간 적립을 덮어쓴다). 대난투 발표(KST 10시) 직후는 피해서 실행.
    await tx`set local lock_timeout = '5s'`;
    const ledgerSrv = srv === null ? tx`` : tx`and server_id = ${srv}`;
    await tx`update characters c set melee_points = s.total
             from (select user_id, server_id, sum(delta) as total from point_ledger where kind = 'melee' ${ledgerSrv} group by 1, 2) s
             where s.user_id = c.user_id and s.server_id = c.server_id and c.melee_points is distinct from s.total`;
    // 마일리지 잔액 = 서버별 지갑(0211과 같은 문장). 값이 다를 때만 쓴다 — 같은 이유(실시간 적립을 덮지 않게).
    await tx`insert into mileage_wallets (user_id, server_id, balance)
             select user_id, server_id, greatest(0, sum(delta)) from point_ledger
              where kind = 'mileage' and server_id is not null ${ledgerSrv} group by user_id, server_id
             on conflict (user_id, server_id) do update set balance = excluded.balance
              where mileage_wallets.balance is distinct from excluded.balance`;
  });
  console.log(`[backfill] 원장 신규 ${ins}행, 잔액 재계산 완료`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
