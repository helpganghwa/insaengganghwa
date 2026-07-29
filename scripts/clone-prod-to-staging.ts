/**
 * 프로덕션 → 스테이징 데이터 복제(테스트용). ⚠ 스테이징 public 데이터를 **전부 지우고** 덮어쓴다.
 *
 *   bun run scripts/clone-prod-to-staging.ts            # dry-run(계획만 출력)
 *   bun run scripts/clone-prod-to-staging.ts --apply    # 실제 실행
 *
 * 설계 메모
 *  - FK 순서 정렬 대신 `session_replication_role = replica`(스테이징에서 사용 가능 확인)로 트리거를
 *    끄고 넣는다. 테이블 의존 그래프를 풀 필요가 없어 실패 지점이 줄어든다.
 *  - 거대 로그 테이블(강화/보급/초월 이력 160만 행)은 제외 — 점령전·랭킹 테스트에 쓰이지 않는데
 *    전송 시간의 대부분을 차지한다.
 *  - 컬럼은 **양쪽 교집합**만 복사한다(스테이징이 dev 마이그레이션만큼 앞서 있어 컬럼이 더 많다).
 *  - auth.users는 개인정보를 지우고 id만 살린다 — profiles.id FK 충족이 목적이고, 스테이징은
 *    공용 계정으로 열려 있어 실유저 이메일이 남으면 안 된다.
 *  - 전투력 상위 3명은 cbt/cbt2/cbt3 계정으로 로그인되게 이메일·비밀번호 해시를 이식한다.
 */
import 'dotenv/config';
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');

/** 복사 제외 — 대용량 이력(테스트 무관) + 환경 고유 원장 + 실유저 사생활·실물 영향 테이블. */
const EXCLUDE = new Set([
  // 대용량 이력 — 160만 행으로 전송 시간의 대부분인데 점령전·랭킹 테스트엔 쓰이지 않는다.
  'enhancement_jobs',
  'enhancement_logs',
  'gem_time_reductions',
  'supply_open_logs',
  'transcend_logs',
  // 환경 고유 — 스테이징 값이 맞다.
  'schema_migrations', // 스테이징이 앞서 있음(0139) — 덮으면 마이그레이션 이력이 어긋난다
  'cron_heartbeats',
  'client_errors',
  // ⚠ 실물 영향 — 실유저 기기 토큰. 복사하면 스테이징에서 보낸 푸시가 실제 유저에게 도달한다.
  'push_subscriptions',
  'push_pending',
  // 유저가 쓴 글·개인정보 — 스테이징은 공용 계정으로 열려 있어 그대로 두면 안 된다.
  'support_inquiries',
  'chat_messages',
  'chat_reports',
  'chat_blocks',
  'profile_reports',
  'identity_verifications',
  // 결제·정산 — 실거래 기록. 테스트에 불필요하고 오해를 부른다.
  'iap_orders',
  'iap_refunds',
  'payment_alerts',
  'shop_purchases',
  'monthly_purchase_limits',
  'admin_actions',
  'admin_mail_logs',
  'admin_scheduled_mails',
  'referral_attributions',
]);

/** DB 통합 테스트 계정 — 지우면 tests/가 깨진다(TEST_USER_ID 게이트). */
const KEEP_AUTH_EMAIL = 'test-wallet@ganghwa.test';
/** 전투력 1~3위에 이식할 로그인 계정(순서대로). */
const CBT_EMAILS = ['cbt@ganghwa.app', 'cbt2@ganghwa.app', 'cbt3@ganghwa.app'];

const prodUrl = process.env.PROD_DATABASE_URL;
const stagingUrl = process.env.DATABASE_URL;
if (!prodUrl || !stagingUrl) throw new Error('PROD_DATABASE_URL / DATABASE_URL 필요');
if (prodUrl === stagingUrl) throw new Error('두 URL이 같다 — 중단');

const src = postgres(prodUrl, { prepare: false, max: 3 });
const dst = postgres(stagingUrl, { prepare: false, max: 3 });

type Col = { table: string; column: string };

async function columnsOf(sql: postgres.Sql): Promise<Map<string, Set<string>>> {
  const rows = await sql<Col[]>`
    select table_name as table, column_name as column
    from information_schema.columns
    where table_schema = 'public'`;
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!m.has(r.table)) m.set(r.table, new Set());
    m.get(r.table)!.add(r.column);
  }
  return m;
}

const srcCols = await columnsOf(src);
const dstCols = await columnsOf(dst);

const counts = await src<{ t: string; n: string }[]>`
  select relname as t, n_live_tup::text as n from pg_stat_user_tables where schemaname = 'public'`;
const countBy = new Map(counts.map((c) => [c.t, Number(c.n)]));

const tables = [...srcCols.keys()]
  .filter((t) => !EXCLUDE.has(t) && dstCols.has(t))
  .sort((a, b) => (countBy.get(b) ?? 0) - (countBy.get(a) ?? 0));

const totalRows = tables.reduce((s, t) => s + (countBy.get(t) ?? 0), 0);
console.log(`복사 대상 ${tables.length}개 테이블 · 약 ${totalRows.toLocaleString()}행`);
console.log(`제외 ${[...EXCLUDE].join(', ')}`);
const skipped = [...srcCols.keys()].filter((t) => !EXCLUDE.has(t) && !dstCols.has(t));
if (skipped.length > 0) console.log(`⚠ 스테이징에 없는 테이블(건너뜀): ${skipped.join(', ')}`);

// 전투력 상위 3명 — cron 사전계산 스냅샷(leaderboard_ranks.metric='combat') 기준.
const top = await src<{ user_id: string; value: string; nickname: string | null }[]>`
  select lr.user_id, lr.value::text as value, c.nickname
  from leaderboard_ranks lr
  left join characters c on c.user_id = lr.user_id and c.server_id = lr.server_id
  where lr.metric = 'combat'
  order by lr.value desc
  limit 3`;
console.log('\n전투력 1~3위 → 로그인 매핑');
top.forEach((t, i) => console.log(`  ${i + 1}. ${t.nickname ?? '?'} (${Number(t.value).toLocaleString()}) → ${CBT_EMAILS[i]}`));

if (!APPLY) {
  console.log('\n[dry-run] --apply 를 붙이면 실제로 실행한다.');
  await src.end();
  await dst.end();
  process.exit(0);
}

// ── 실행 ──────────────────────────────────────────────────────────────
const [cbtHash] = await dst<{ hash: string | null }[]>`
  select encrypted_password as hash from auth.users where email = ${CBT_EMAILS[0]!}`;
if (!cbtHash?.hash) throw new Error(`스테이징에 ${CBT_EMAILS[0]} 계정이 없어 비밀번호 해시를 못 가져온다`);
const passwordHash = cbtHash.hash;

const [keepUser] = await dst<{ id: string }[]>`
  select id from auth.users where email = ${KEEP_AUTH_EMAIL}`;

console.log('\n① 스테이징 public 데이터 삭제');
await dst.unsafe(`truncate table ${tables.map((t) => `public."${t}"`).join(', ')} restart identity cascade`);

console.log('② auth.users 교체(개인정보 스크럽)');
await dst`delete from auth.users where email is distinct from ${KEEP_AUTH_EMAIL}`;
const authRows = await src<{ id: string; created_at: Date; updated_at: Date | null }[]>`
  select id, created_at, updated_at from auth.users order by created_at`;
let seq = 0;
for (const u of authRows) {
  if (keepUser && u.id === keepUser.id) continue; // 보존 계정과 id 충돌 방지
  seq += 1;
  await dst`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, is_sso_user, is_anonymous
    ) values (
      ${u.id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      ${`u${seq}@staging.invalid`}, ${passwordHash}, now(),
      ${u.created_at}, ${u.updated_at ?? u.created_at},
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      false, false, false
    ) on conflict (id) do nothing`;
}
console.log(`   auth.users ${seq}행`);

console.log('③ 테이블 복사');
const BATCH = 500;
for (const t of tables) {
  const cols = [...srcCols.get(t)!].filter((c) => dstCols.get(t)!.has(c));
  if (cols.length === 0) continue;
  const list = cols.map((c) => `"${c}"`).join(', ');
  const rows = await src.unsafe<Record<string, unknown>[]>(`select ${list} from public."${t}"`);
  if (rows.length === 0) continue;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await dst.begin(async (tx) => {
      await tx.unsafe(`set local session_replication_role = 'replica'`);
      await tx.unsafe(
        `insert into public."${t}" (${list}) values ${chunk
          .map((_, r) => `(${cols.map((_c, c) => `$${r * cols.length + c + 1}`).join(', ')})`)
          .join(', ')} on conflict do nothing`,
        chunk.flatMap((row) => cols.map((c) => row[c] ?? null)) as never[],
      );
    });
  }
  console.log(`   ${t}: ${rows.length}행`);
}

console.log('④ 시퀀스 보정');
const seqs = await dst<{ t: string; c: string }[]>`
  select c.relname as t, a.attname as c
  from pg_class c
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and pg_get_serial_sequence('public.' || quote_ident(c.relname), a.attname) is not null`;
for (const s of seqs) {
  if (!tables.includes(s.t)) continue;
  await dst.unsafe(
    `select setval(pg_get_serial_sequence('public."${s.t}"', '${s.c}'),
       coalesce((select max("${s.c}") from public."${s.t}"), 1), true)`,
  );
}
console.log(`   ${seqs.length}개 시퀀스`);

console.log('⑤ 전투력 1~3위 로그인 계정 이식');
for (let i = 0; i < top.length; i++) {
  const email = CBT_EMAILS[i]!;
  await dst`delete from auth.users where email = ${email} and id <> ${top[i]!.user_id}`;
  await dst`
    update auth.users
       set email = ${email}, encrypted_password = ${passwordHash}, email_confirmed_at = now()
     where id = ${top[i]!.user_id}`;
  console.log(`   ${email} → ${top[i]!.nickname ?? top[i]!.user_id}`);
}

await src.end();
await dst.end();
console.log('\n완료. 스테이징에서 cbt123456으로 로그인하면 상위 3명으로 접속된다.');
