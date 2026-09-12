import postgres from 'postgres';
const sql = postgres(process.env.PROD_DATABASE_URL!, { prepare: false, max: 2 });

console.log('=== Play 주문 전수 (실유저/테스트 구분, 정확 시각 KST) ===');
const all = await sql`
  select to_char(o.created_at at time zone 'Asia/Seoul','MM-DD HH24:MI:SS') t,
         o.status, o.product_code,
         case when au.email like '%@ganghwa.app' then 'TEST' else '실유저' end kind,
         left(o.user_id::text,8) uid8,
         o.play_purchase_token is not null tok,
         o.play_consumed_at is not null consumed
  from iap_orders o join auth.users au on au.id = o.user_id
  where o.provider='play' order by o.created_at`;
for (const r of all) console.log(' ', Object.values(r).map(String).join('  '));

console.log('\n=== 실유저의 앱 결제 시도 요약 ===');
const s = await sql`
  select left(o.user_id::text,8) uid8, count(*)::int "시도",
         count(*) filter (where o.status='paid')::int "성공",
         to_char(min(o.created_at) at time zone 'Asia/Seoul','MM-DD HH24:MI') "처음",
         to_char(max(o.created_at) at time zone 'Asia/Seoul','MM-DD HH24:MI') "마지막"
  from iap_orders o join auth.users au on au.id=o.user_id
  where o.provider='play' and au.email not like '%@ganghwa.app'
  group by 1 order by 2 desc`;
for (const r of s) console.log(' ', Object.values(r).map(String).join('  '));
await sql.end();
