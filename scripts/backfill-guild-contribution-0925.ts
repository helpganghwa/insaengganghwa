/**
 * 길드 기여도 1회성 복원(2026-09-25, 문의 #331 · 사용자 결정 "최소치로 해당 유저 전원").
 *
 * 대상: 지금 길드에 있으면서, 같은 길드를 예전에 탈퇴·추방으로 나갔던 사람. 그때 쌓은 기여도는 행 삭제로
 * 사라졌고 길드별 기부 기록이 없어, **확실한 최소치**만 되돌린다:
 *   이전 소속 기간([그 기간의 마지막 join, 탈퇴·추방 시각))의 유료 기부(diamond_ledger 'guild_donate')를 날짜별로 세고,
 *   유료가 있는 날은 같은 소속 행에서 무료 1회차를 먼저 했으므로(일일 카운터가 소속 행마다 0부터) +1.
 *   기부 1회 = 기여도 30(출시 이후 불변). 무료만 한 날은 날짜 기록이 없어 셀 수 없다 → 최소치.
 *
 * 멱등: 복원마다 admin_actions(action='guild_contribution_restore', target_id='<user>:<guild>')를 남기고,
 * 있으면 건너뛴다. 기본은 미리보기(읽기 전용). 반영은 --apply.
 *   DATABASE_URL="$(grep -E '^PROD_DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')" bun scripts/backfill-guild-contribution-0925.ts [--apply]
 */
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const XP_PER_DONATION = 30;
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

type Row = { user_id: string; server_id: number; guild_id: string; nickname: string; guild: string; now_cp: string; min_donations: number };

const run = async (tx: postgres.TransactionSql) => {
  const rows = (await tx`
    with cur as (
      select m.user_id, m.server_id, m.guild_id, m.joined_at, m.contribution_points cp from guild_members m
    ), exits as (
      select c.user_id, c.server_id, c.guild_id, a.created_at ex
        from cur c join guild_audit_log a on a.guild_id = c.guild_id and a.server_id = c.server_id
         and ((a.action = 'leave' and a.actor_user_id = c.user_id) or (a.action = 'kick' and a.target_user_id = c.user_id))
       where a.created_at < c.joined_at
    ), periods as (
      select e.*, coalesce((select max(j.created_at) from guild_audit_log j where j.guild_id = e.guild_id and j.action = 'join'
               and j.actor_user_id = e.user_id and j.created_at < e.ex), g.created_at) st
        from exits e join guilds g on g.id = e.guild_id
    ), paid as (
      select p.user_id, p.guild_id, (l.created_at at time zone 'Asia/Seoul')::date d, count(*)::int n
        from periods p join diamond_ledger l on l.user_id = p.user_id and l.server_id = p.server_id
         and l.reason = 'guild_donate' and l.created_at >= p.st and l.created_at < p.ex
       group by 1, 2, 3
    )
    select c.user_id, c.server_id, c.guild_id::text guild_id, ch.nickname, g.name guild, c.cp::text now_cp,
           coalesce((select sum(n + 1)::int from paid x where x.user_id = c.user_id and x.guild_id = c.guild_id), 0) min_donations
      from cur c join characters ch on ch.user_id = c.user_id and ch.server_id = c.server_id join guilds g on g.id = c.guild_id
     where exists (select 1 from periods p where p.user_id = c.user_id and p.guild_id = c.guild_id)
     order by min_donations desc`) as unknown as Row[];

  const [admin] = await tx`select id from profiles where is_admin order by created_at limit 1`;
  if (!admin) throw new Error('관리자 계정 없음');

  for (const r of rows) {
    const add = r.min_donations * XP_PER_DONATION;
    const key = `${r.user_id}:${r.guild_id}`;
    const [done] = await tx`select 1 from admin_actions where action = 'guild_contribution_restore' and target_id = ${key}`;
    const tag = done ? '이미 복원' : add === 0 ? '복원 없음' : APPLY ? '복원' : '복원 예정';
    console.log(`${tag}\t${r.nickname}\t${r.guild}\t현재 ${r.now_cp} → ${Number(r.now_cp) + (done ? 0 : add)}\t(+${add}, 최소 기부 ${r.min_donations}회)`);
    if (!APPLY || done || add === 0) continue;
    await tx`update guild_members set contribution_points = contribution_points + ${add}
              where user_id = ${r.user_id}::uuid and server_id = ${r.server_id} and guild_id = ${r.guild_id}::bigint`;
    await tx`insert into admin_actions (admin_user_id, action, target_type, target_id, payload)
             values (${admin.id}, 'guild_contribution_restore', 'guild_member', ${key},
                     ${sql.json({ added: add, minDonations: r.min_donations, before: r.now_cp, reason: 'inquiry #331 — 재가입 전 기여도 최소치 복원' })})`;
  }
};

if (APPLY) await sql.begin(run);
else await sql.begin('read only', run);
console.log(APPLY ? '반영 완료' : '미리보기(읽기 전용) — 반영은 --apply');
await sql.end();
