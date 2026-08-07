import postgres from 'postgres';
/* 차단 필터 실증 — 롤백 트랜잭션 안에서 차단 전/후 목록·노티점 소스를 비교(무오염). */
const sql = postgres(process.env.DATABASE_URL!.replace(':6543', ':5432'), { prepare: false, max: 1 });
const threadsSql = (me: string) => sql`
  with pairs as (
    select distinct on (least(from_user_id,to_user_id), greatest(from_user_id,to_user_id))
           id, (case when from_user_id = ${me}::uuid then to_user_id else from_user_id end) as peer
    from whisper_messages where server_id=1 and (from_user_id=${me}::uuid or to_user_id=${me}::uuid)
    order by least(from_user_id,to_user_id), greatest(from_user_id,to_user_id), id desc)
  select p.peer::text peer,
    (select count(*)::int from whisper_messages m where m.server_id=1 and m.to_user_id=${me}::uuid
      and m.from_user_id=p.peer and m.hidden_at is null
      and m.id > coalesce(r.last_read_id,0) and m.id > coalesce(r.hidden_before_id,0)) unread
  from pairs p left join whisper_reads r on r.user_id=${me}::uuid and r.server_id=1 and r.peer_user_id=p.peer
  where p.id > coalesce(r.hidden_before_id,0)
    and not exists (select 1 from chat_blocks b
      where (b.user_id=${me}::uuid and b.blocked_user_id=p.peer) or (b.user_id=p.peer and b.blocked_user_id=${me}::uuid))
  order by p.id desc`;
const notiSql = (me: string) => sql`
  select max(id)::text v from whisper_messages m
  where m.server_id=1 and m.to_user_id=${me}::uuid and m.hidden_at is null
    and not exists (select 1 from chat_blocks b
      where (b.user_id=${me}::uuid and b.blocked_user_id=m.from_user_id) or (b.user_id=m.from_user_id and b.blocked_user_id=${me}::uuid))`;
try {
  const [pair] = await sql`select to_user_id::text me, from_user_id::text peer from whisper_messages
    where to_user_id <> from_user_id limit 1`;
  const { me, peer } = pair!;
  await sql.begin(async (tx) => {
    const before = await threadsSql(me); const [nb] = await notiSql(me);
    await tx`insert into chat_blocks (user_id, blocked_user_id) values (${me}::uuid, ${peer}::uuid) on conflict do nothing`;
    const after = await threadsSql(me); const [na] = await notiSql(me);
    console.log(`차단 전: 대화 ${before.length}건(상대 포함 ${before.some((t) => t.peer === peer)}), 노티점소스 ${nb!.v}`);
    console.log(`차단 후: 대화 ${after.length}건(상대 포함 ${after.some((t) => t.peer === peer)}), 노티점소스 ${na!.v}`);
    console.log(`→ 목록·노티점 동시 제외: ${!after.some((t) => t.peer === peer) && nb!.v !== na!.v ? 'OK' : (!after.some((t) => t.peer === peer) ? 'OK(목록 제외, 노티점은 다른 상대분 유지)' : 'FAIL')}`);
    throw new Error('rollback');
  }).catch((e) => { if (e.message !== 'rollback') throw e; });
  const [chk] = await sql`select count(*)::int n from chat_blocks where user_id=${me}::uuid and blocked_user_id=${peer}::uuid`;
  console.log('롤백 확인(차단 행 잔존):', chk!.n === 0 ? '없음 — 무오염' : '남음!');
} finally { await sql.end(); }
