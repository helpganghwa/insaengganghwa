/**
 * CBT 준비 — DB 전체 완전 초기화 + 단일 서버(1=CBT)만 남김.
 *  - 전체 완전 초기화: 계정(profiles)·캐릭터·진행 데이터 전부 비움.
 *  - 보존(KEEP): 콘텐츠/전역/법적 테이블(카탈로그·시스템모드·확률스냅샷·결제/본인인증·관리감사·마이그레이션).
 *  - 인프라(INFRA): servers/zones/zone_adjacency — 1서버만 남기고 2서버 제거, servers.name='CBT'.
 *  - 나머지(WIPE): 전부 TRUNCATE.
 * 테이블은 실DB(information_schema)에서 열거(스키마 밖 수동 테이블 포함).
 *
 * 실행: bun run scripts/_cbt-reset.ts            → DRY-RUN(계획만 출력, 변경 없음)
 *       bun run scripts/_cbt-reset.ts CONFIRM    → 실제 적용(파괴적)
 */
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
config({ path: '.env.local' });

const EXECUTE = process.argv[2] === 'CONFIRM';
const KEEP_SERVER = 1;
const NEW_NAME = 'CBT';

// 신규 108종 카탈로그(기존 150 삭제 후 적용). {code,name,slot}
const CAT108 = JSON.parse(readFileSync('scripts/_catalog-108.json', 'utf8')) as { code: string; name: string; slot: string }[];

// catalog_items 는 WIPE 후 108종 재시드하므로 KEEP 아님.
const KEEP = new Set([
  'system_mode', 'probability_snapshots', 'admin_actions',
  'iap_orders', 'iap_refunds', 'identity_verifications',
  '__drizzle_migrations', 'drizzle_migrations',
]);
const INFRA = new Set(['servers', 'zones', 'zone_adjacency']);

const sql = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function cols(t: string): Promise<string[]> {
  const r = await sql<{ column_name: string }[]>`
    select column_name from information_schema.columns
    where table_schema='public' and table_name=${t}`;
  return r.map((x) => x.column_name);
}

try {
  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE' order by table_name`;

  const rows: { t: string; bucket: 'KEEP' | 'INFRA' | 'WIPE'; n: number; sid: boolean }[] = [];
  for (const { table_name: t } of tables) {
    const c = await cols(t);
    const sid = c.includes('server_id');
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from ${sql(t)}`;
    const bucket = KEEP.has(t) ? 'KEEP' : INFRA.has(t) ? 'INFRA' : 'WIPE';
    rows.push({ t, bucket, n, sid });
  }

  const fmt = (b: string) => rows.filter((r) => r.bucket === b);
  console.log(`\n=== 테이블 분류 (총 ${rows.length}) ===`);
  for (const b of ['KEEP', 'INFRA', 'WIPE'] as const) {
    console.log(`\n[${b}] ${fmt(b).length}개`);
    for (const r of fmt(b)) console.log(`  ${r.t.padEnd(28)} rows=${String(r.n).padStart(6)}${r.sid ? '  (server_id)' : ''}`);
  }

  const servers = await sql<{ id: number; name: string; status: string }[]>`select id,name,status from servers order by id`;
  console.log('\n=== servers ===');
  for (const s of servers) console.log(`  id=${s.id} name=${s.name} status=${s.status}`);
  const zHasSid = (await cols('zones')).includes('server_id');
  if (zHasSid) {
    const zc = await sql<{ server_id: number; n: number }[]>`select server_id, count(*)::int as n from zones group by server_id order by server_id`;
    console.log('=== zones / server ==='); for (const z of zc) console.log(`  server ${z.server_id}: ${z.n} zones`);
  }
  const zaCols = await cols('zone_adjacency');
  console.log('zone_adjacency columns:', zaCols.join(', ') || '(없음)');

  const wipe = fmt('WIPE').map((r) => r.t);
  console.log(`\n=== 계획 ===`);
  console.log(`1) TRUNCATE ${wipe.length}개 테이블 (restart identity cascade) — catalog_items 포함(기존 150 삭제)`);
  console.log(`2) zones/zone_adjacency: server ${KEEP_SERVER} 외 삭제`);
  console.log(`3) servers: id<>${KEEP_SERVER} 삭제, id=${KEEP_SERVER} name='${NEW_NAME}'`);
  console.log(`4) catalog_items 신규 ${CAT108.length}종 시드 (무기/방어구/장신구)`);

  if (!EXECUTE) {
    console.log('\n*** DRY-RUN — 변경 없음. 실제 적용: bun run scripts/_cbt-reset.ts CONFIRM ***');
    await sql.end();
    process.exit(0);
  }

  // ⚠️ zones는 owner_guild_id/executor_user_id 로 guilds/profiles(WIPE)를 참조 →
  //    TRUNCATE ... CASCADE 시 zones·zone_adjacency까지 함께 비워진다. 그래서
  //    KEEP 서버 구역을 미리 스냅샷 떠 두고, 정복상태 초기화(소유주 null)해 재삽입한다.
  const zaZoneCols = zaCols.filter((c) => /zone/i.test(c) && c !== 'server_id');
  const zSnap = (await sql`select * from zones where server_id = ${KEEP_SERVER}`) as Record<string, unknown>[];
  const keepIds = new Set(zSnap.map((z) => z.id as number));
  const zaAll = (await sql`select * from zone_adjacency`) as Record<string, unknown>[];
  const zaSnap = zaAll.filter((e) =>
    zaCols.includes('server_id')
      ? (e.server_id as number) === KEEP_SERVER
      : zaZoneCols.every((c) => keepIds.has(e[c] as number)),
  );
  // 구역 재삽입 시 소유/정복 상태는 초기화(guilds·users 비워졌으므로 무소속이 정상).
  const RESET_ZONE: Record<string, unknown> = {
    owner_guild_id: null, executor_user_id: null, tax_diamond: '0',
    last_tax_collected_at: null, captured_at: null, tax_points: '0',
  };
  const zClean = zSnap.map((z) => ({ ...z, ...Object.fromEntries(Object.keys(RESET_ZONE).filter((k) => k in z).map((k) => [k, RESET_ZONE[k]])) }));

  await sql.begin(async (tx) => {
    await tx.unsafe(`truncate table ${wipe.map((t) => `"${t}"`).join(', ')} restart identity cascade`);
    await tx`delete from servers where id <> ${KEEP_SERVER}`;
    await tx`update servers set name = ${NEW_NAME} where id = ${KEEP_SERVER}`;
    // CASCADE로 비워진 KEEP 서버 구역 복원(소유주 초기화) + 인접그래프 복원.
    if (zClean.length) await tx`insert into zones ${tx(zClean)}`;
    if (zaSnap.length) await tx`insert into zone_adjacency ${tx(zaSnap)}`;
    // 신규 108종 카탈로그 시드
    await tx`insert into catalog_items ${tx(CAT108, 'code', 'name', 'slot')}`;
  });
  const [{ cn }] = await sql<{ cn: number }[]>`select count(*)::int as cn from catalog_items`;
  console.log(`\n✓ 초기화 완료. 단일 서버(CBT)만 남음. catalog_items ${cn}종.`);
  const after = await sql<{ id: number; name: string }[]>`select id,name from servers order by id`;
  for (const s of after) console.log(`  server id=${s.id} name=${s.name}`);
} catch (e) {
  console.error('✗ 실패(롤백됨):', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
