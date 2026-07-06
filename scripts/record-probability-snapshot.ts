// 확률/수치 공시 스냅샷 기록 — probability_snapshots에 공시 전문을 영구 적재.
// 게임산업법 §33 기록 의무: 확률·수치 변경(밸런스 개정·카탈로그 전환·정식 오픈) 시 1회 실행.
// 실행: bun run scripts/record-probability-snapshot.ts [--confirm] [--note="사유"]
//   기본 드라이런(페이로드 출력만). --confirm일 때만 insert. 대상 DB = DIRECT_URL(.env.local).

import { config } from 'dotenv';
import postgres from 'postgres';

import { buildProbabilityPayloadCore } from '../lib/game/probability-payload';

config({ path: '.env.local' });
config({ path: '.env', override: false });

const CONFIRM = process.argv.includes('--confirm');
const note = process.argv.find((a) => a.startsWith('--note='))?.slice(7) ?? null;

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL 또는 DIRECT_URL 필요 — .env.local 확인');
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });

async function main() {
  // 공시 페이지(app/probability/page.tsx)·대시보드 최신성 검사와 동일한 단일 출처
  // (lib/game/probability-payload.ts)에서 전문 구성. 보급 1/N의 활성 카탈로그 수는 DB 고정.
  const slotCounts = (await sql`
    select slot, count(*)::int as n from catalog_items where active = true group by slot order by slot
  `) as unknown as Array<{ slot: string; n: number }>;
  const core = buildProbabilityPayloadCore(slotCounts);
  const payload = { ...core, note };

  console.log(
    `공시 스냅샷 페이로드 — enhance ${core.enhance.table.length}행 · transcend ${core.transcend.length}행 · supply ${core.supply.length}슬롯`,
  );
  console.log(JSON.stringify({ ...payload, enhance: { ...payload.enhance, table: '(100행 생략)' } }, null, 2));

  if (!CONFIRM) {
    console.log('\n드라이런 — 기록하려면 --confirm 을 붙여 실행하세요.');
    return;
  }
  const [row] = await sql`
    insert into probability_snapshots (effective_at, payload)
    values (now(), ${sql.json(payload)})
    returning id, effective_at
  `;
  console.log(`기록 완료 — id=${row!.id} effective_at=${row!.effective_at}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
