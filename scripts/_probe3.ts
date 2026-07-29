import 'dotenv/config';
import postgres from 'postgres';
const st = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });
// FK 무시 삽입이 가능한지(가능하면 의존 순서 정렬 불필요).
let replicaOk = false;
try {
  await st.begin(async (tx) => {
    await tx.unsafe(`set local session_replication_role = 'replica'`);
    replicaOk = true;
  });
} catch (e) {
  replicaOk = false;
  console.log('session_replication_role 불가:', (e as Error).message.slice(0, 120));
}
console.log('session_replication_role=replica →', replicaOk ? 'OK' : 'NO');
const [pw] = await st<{ id: string; email: string; hash: string }[]>`
  select id, email, encrypted_password as hash from auth.users where email = 'cbt@ganghwa.app'`;
console.log('cbt 해시 확보:', !!pw?.hash, pw?.hash?.slice(0, 12));
await st.end();

const pr = postgres(process.env.PROD_DATABASE_URL!, { prepare: false, max: 2 });
const tabs = await pr<{ t: string; n: string }[]>`
  select relname as t, n_live_tup::text as n from pg_stat_user_tables
  where schemaname='public' order by relname`;
console.log('PROD public 테이블', tabs.length, '개');
console.log(tabs.map((x) => `${x.t}:${x.n}`).join('  '));
await pr.end();
