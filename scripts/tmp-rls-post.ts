import postgres from 'postgres';
const env = process.argv[2] ?? 'DIRECT_URL';
const sql = postgres(process.env[env]!, { prepare: false, max: 1 });
await sql.begin('read only', async (tx) => {
  const r = await tx`select count(*)::int total, count(*) filter (where rowsecurity)::int on_, count(*) filter (where not rowsecurity)::int off_ from pg_tables where schemaname='public'`;
  console.log(`[${env}] 표/RLS켜짐/꺼짐:`, JSON.stringify([...r][0]));
  const smoke = await tx`select (select count(*)::int from diamond_ledger) dl, (select count(*)::int from chat_messages) cm, (select count(*)::int from user_titles) ut, (select count(*)::int from expeditions) ex`;
  console.log('   앱 역할로 읽기:', JSON.stringify([...smoke][0]));
});
await sql.end();
