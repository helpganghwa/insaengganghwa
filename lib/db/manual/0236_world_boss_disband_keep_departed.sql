-- 0236 길드 해산 때 출발한 원정대 기록을 남긴다(10-11 감사): parties.guild_id를 nullable + on delete set null로.
-- 종전 cascade는 departed 행과 대원 행까지 지워 (boss_id, user_id) 유니크가 풀려 같은 보스에 다시 참가할 수 있었다.
-- 모집 중 원정대는 해산 코드(lib/game/guild/disband.ts)가 길드 행을 지우기 전에 직접 해산한다.
-- 멱등(10-11 재검사: 종전 판은 add constraint가 재실행 때 'already exists'로 깨졌다). guilds는 늘 갱신되는 표라 잠금을 오래 기다리지 않는다
-- (lock_timeout 3s — 못 잡으면 실패하니 한산한 시간에 다시 실행).
begin;
set local lock_timeout = '3s';
alter table world_boss_parties alter column guild_id drop not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
     where c.conname = 'world_boss_parties_guild_id_fkey' and t.relname = 'world_boss_parties' and c.confdeltype = 'n'
  ) then
    alter table world_boss_parties drop constraint if exists world_boss_parties_guild_id_fkey;
    alter table world_boss_parties add constraint world_boss_parties_guild_id_fkey foreign key (guild_id) references guilds(id) on delete set null;
  end if;
  -- 세금 상자는 음수가 될 수 없다(다층 방어).
  if not exists (select 1 from pg_constraint where conname = 'guilds_tax_pool_boxes_nonneg') then
    alter table guilds add constraint guilds_tax_pool_boxes_nonneg check (tax_pool_boxes >= 0) not valid;
  end if;
end $$;
-- guilds는 작은 표라 같은 트랜잭션에서 바로 검사한다(이미 검사됐으면 즉시 끝난다). 적용 스크립트가 파일 전체를 한 트랜잭션으로 감싸므로 commit 뒤에 문장을 두지 않는다.
alter table guilds validate constraint guilds_tax_pool_boxes_nonneg;
commit;
