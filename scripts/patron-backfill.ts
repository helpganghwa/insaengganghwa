// 후원 구간 보상 소급 지급(0175) — 기존 결제자 전원에게 도달 구간 우편을 1회 지급.
//   dry-run: bun run --conditions=react-server scripts/patron-backfill.ts
//   실행   : bun run --conditions=react-server scripts/patron-backfill.ts --apply
//   프로덕션: PATRON_TARGET=prod 를 앞에 붙인다(DATABASE_URL을 PROD_DATABASE_URL로 교체). 기본은 스테이징.
// 멱등(patron_milestone_grants PK) — 재실행해도 이미 지급된 구간은 건너뛴다. 코드 배포 후 실행(0190을 직전에 한 번 더 적용).
import { config } from 'dotenv';
config({ path: '.env.local' });
if (process.env.PATRON_TARGET === 'prod') process.env.DATABASE_URL = process.env.PROD_DATABASE_URL!;

import { sql } from 'drizzle-orm';

const apply = process.argv.includes('--apply');
const { db } = await import('../lib/db/client');
const { grantPatronMilestones } = await import('../lib/game/patron/grant');
const { reachedMilestones, formatKrwMan } = await import('../lib/game/patron/milestones');

const payers = (await db.execute(sql`
  select o.user_id, sum(o.amount_krw)::bigint as paid,
         (select string_agg(distinct c.nickname, '/') from characters c where c.user_id = o.user_id) as nick,
         (select p.last_server_id from profiles p where p.id = o.user_id) as server_id,
         (select count(*)::int from patron_milestone_grants g where g.user_id = o.user_id) as already
  from iap_orders o where o.status = 'paid' group by o.user_id order by paid desc
`)) as unknown as { user_id: string; paid: string; nick: string | null; server_id: number | null; already: number }[];

console.log(`대상: ${process.env.PATRON_TARGET === 'prod' ? '프로덕션' : '스테이징'} · 결제자 ${payers.length}명 · ${apply ? '지급 실행' : 'DRY-RUN'}`);
let totalD = 0, totalB = 0, totalMails = 0;
for (const p of payers) {
  const paid = Number(p.paid);
  const reached = reachedMilestones(paid);
  const pending = Math.max(0, reached.length - p.already);
  const d = reached.reduce((a, m) => a + m.diamond, 0), b = reached.reduce((a, m) => a + m.boxes, 0);
  console.log(`${(p.nick ?? p.user_id).padEnd(14)} ₩${paid.toLocaleString()} → ${reached.length}구간(미지급 ${pending}) ${reached.length ? `~${formatKrwMan(reached[reached.length - 1]!.krw)}` : ''} 💎${d.toLocaleString()} 📦${b}`);
  if (!apply || pending === 0) continue;
  const serverId = p.server_id ?? 1;
  const granted = await db.transaction((tx) => grantPatronMilestones(tx, p.user_id, serverId));
  totalMails += granted.length;
  totalD += granted.reduce((a, m) => a + m.diamond, 0);
  totalB += granted.reduce((a, m) => a + m.boxes, 0);
  console.log(`  ✓ 지급 ${granted.length}통 (서버 ${serverId})`);
}
if (apply) console.log(`\n합계: 우편 ${totalMails}통 · 💎${totalD.toLocaleString()} · 📦${totalB.toLocaleString()}`);
process.exit(0);
