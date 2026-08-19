// 카탈로그 원자 교체 — 신규 N종 편성 + 퇴역 N종 비활성화를 **한 트랜잭션**으로.
//
// 왜 seed-catalog.ts로 하지 않는가: 그쪽은 120건 upsert 후 별도 UPDATE라, 신규가 들어가고
// 퇴역이 빠지기 전까지 활성 종수가 늘어난 창이 생긴다. 그 창에서 판정은 1/46인데 공시는
// 1/40이라 어긋난다(게임산업법 §33). 여기서는 두 변경을 같은 트랜잭션에 넣고,
// **커밋 전에 슬롯별 활성 종수가 그대로인지 확인**해 아니면 롤백한다.
//
// 실행: bun --conditions=react-server run scripts/swap-catalog.ts [--prod] [--apply]
//   기본은 드라이런(롤백). --apply 를 줘야 커밋한다.
//   --prod 는 PROD_DATABASE_URL 사용(미지정 시 DATABASE_URL = 스테이징).
//
// ⚠ 적용 후 반드시 카탈로그 캐시를 무효화할 것 — getActiveCatalog가 10분 캐시라
//   그동안 공시 페이지가 옛 목록을 보인다: POST /api/admin/revalidate?tag=catalog
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });
config({ path: '.env', override: false });

/** 편성에서 뺄 코드 — 이미 CATALOG_ITEMS에서 제거돼 코드로는 못 찾는다. */
const RETIRE = [
  'fallen_grace_greatbow',
  'temple_frostward_bow',
  'fallen_half_blade',
  'general_spiral_lance',
  'temple_icicle_longbow',
  'vault_key_greatsword',
] as const;

/** 새로 넣을 코드 — catalog-v5. name/slot은 CATALOG_ITEMS에서 읽어 어긋남을 막는다. */
const ADD = [
  'temple_ringstaff_khakkhara',
  'volcano_flame_blade',
  'swamp_antler_bow',
  'druid_antler_staff',
  'oni_slayer_odachi',
  'druid_thorn_staff',
] as const;

const prod = process.argv.includes('--prod');
const apply = process.argv.includes('--apply');
const url = prod ? process.env.PROD_DATABASE_URL : (process.env.DIRECT_URL ?? process.env.DATABASE_URL);
if (!url) {
  console.error(prod ? 'PROD_DATABASE_URL 필요' : 'DATABASE_URL/DIRECT_URL 필요');
  process.exit(1);
}

const { CATALOG_ITEMS } = await import('../lib/game/equipment/catalog');
const byKey = new Map(CATALOG_ITEMS.map((c) => [c.key, c]));
for (const k of ADD) {
  if (!byKey.has(k)) {
    console.error(`카탈로그에 없는 신규 코드: ${k}`);
    process.exit(1);
  }
}

type Counts = Record<string, number>;
const fmt = (c: Counts) =>
  Object.entries(c)
    .sort()
    .map(([s, n]) => `${s} ${n}`)
    .join(' · ');

const sql = postgres(url, { prepare: false, max: 1 });
console.log(`대상: ${prod ? '프로덕션' : '스테이징'} · ${apply ? '적용(커밋)' : '드라이런(롤백)'}`);

let committed = false;
try {
  await sql.begin(async (tx) => {
    const count = async (): Promise<Counts> => {
      const rows = await tx<{ slot: string; n: number }[]>`
        select slot, count(*)::int as n from catalog_items where active = true group by slot`;
      return Object.fromEntries(rows.map((r) => [r.slot, r.n]));
    };

    const before = await count();
    console.log(`  전  활성: ${fmt(before)}`);

    for (const k of ADD) {
      const c = byKey.get(k)!;
      await tx`
        insert into catalog_items (code, name, slot, active)
        values (${k}, ${c.nameKo}, ${c.slot}, true)
        on conflict (code) do update set name = excluded.name, slot = excluded.slot, active = true`;
    }
    const off = await tx<{ code: string }[]>`
      update catalog_items set active = false
      where code = any(${RETIRE as unknown as string[]}) and active = true
      returning code`;

    const after = await count();
    console.log(`  후  활성: ${fmt(after)}`);
    console.log(`  편성 +${ADD.length} / 비활성 -${off.length}`);

    // 활성 종수 불변이 이 작업의 안전 조건이다 — 어긋나면 확률이 바뀐 것이므로 커밋하지 않는다.
    const slots = new Set([...Object.keys(before), ...Object.keys(after)]);
    const drift = [...slots].filter((s) => (before[s] ?? 0) !== (after[s] ?? 0));
    if (drift.length) {
      throw new Error(
        `활성 종수가 바뀌었다(${drift.map((s) => `${s}: ${before[s] ?? 0}→${after[s] ?? 0}`).join(', ')}) — 롤백`,
      );
    }
    if (off.length !== ADD.length) {
      throw new Error(`비활성 ${off.length}건 ≠ 편성 ${ADD.length}건 — 롤백`);
    }
    if (!apply) throw new Error('드라이런 — 롤백(적용하려면 --apply)');
    committed = true;
  });
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.log(committed ? `커밋 후 오류: ${msg}` : `롤백: ${msg}`);
  if (!/드라이런/.test(msg)) process.exitCode = 1;
}

if (committed) {
  console.log('\n적용 완료 — 캐시 무효화 필요: POST /api/admin/revalidate?tag=catalog');
}
await sql.end();
