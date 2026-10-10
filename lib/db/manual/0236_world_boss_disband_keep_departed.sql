-- 0236 길드 해산 때 출발한 원정대 기록을 남긴다(10-11 감사): parties.guild_id를 nullable + on delete set null로.
-- 종전 cascade는 departed 행과 대원 행까지 지워 (boss_id, user_id) 유니크가 풀려 같은 보스에 다시 참가할 수 있었다.
-- 모집 중 원정대는 해산 코드(lib/game/guild/disband.ts)가 길드 행을 지우기 전에 직접 해산한다.
alter table world_boss_parties alter column guild_id drop not null;
alter table world_boss_parties drop constraint if exists world_boss_parties_guild_id_fkey;
alter table world_boss_parties add constraint world_boss_parties_guild_id_fkey foreign key (guild_id) references guilds(id) on delete set null;
-- 세금 상자는 음수가 될 수 없다(다층 방어).
alter table guilds add constraint guilds_tax_pool_boxes_nonneg check (tax_pool_boxes >= 0) not valid;
alter table guilds validate constraint guilds_tax_pool_boxes_nonneg;
