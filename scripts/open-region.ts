/**
 * 지역 개방(콜드스타트 단계 개방) — 운영 이벤트(코드 배포 불필요).
 *
 * 사용: bun run scripts/open-region.ts <serverId> <region>
 *   region: orc | swamp | temple | volcano | angel | kingdom
 *   예: bun run scripts/open-region.ts 3 orc
 *
 * 권장 개방 순서(SERVER.md): kingdom(시작) → orc → swamp → volcano → temple → angel
 */
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const serverId = Number(process.argv[2]);
const region = process.argv[3];
const REGIONS = ['volcano', 'temple', 'swamp', 'orc', 'kingdom', 'angel'];
if (!Number.isInteger(serverId) || serverId < 1 || !REGIONS.includes(region ?? '')) {
  console.error('사용: bun run scripts/open-region.ts <serverId> <region(volcano|temple|swamp|orc|kingdom|angel)>');
  process.exit(1);
}

const url = process.env.DIRECT_URL;
if (!url) throw new Error('DIRECT_URL required');
const sql = postgres(url, { prepare: false, max: 1 });

try {
  const rows = await sql`
    update zones set locked = false
    where server_id = ${serverId} and region = ${region} and locked = true
    returning name`;
  if (rows.length === 0) {
    console.log(`[open-region] 변경 없음 — 이미 개방됐거나 해당 지역 없음 (server ${serverId}, ${region})`);
  } else {
    console.log(`[open-region] server ${serverId} · ${region} 개방 — ${rows.length}구역: ${rows.map((r) => r.name).join(', ')}`);
  }
  const left = await sql`
    select region::text, count(*)::int n from zones
    where server_id = ${serverId} and locked = true group by 1 order by 1`;
  console.log('남은 잠금 지역:', left.length ? left.map((r) => `${r.region}(${r.n})`).join(' · ') : '없음(전 지역 개방)');
} finally {
  await sql.end({ timeout: 5 });
}
