-- 0238 world_boss_parties.guild_id FK 인덱스(10-11 재검사): 길드 해산(disband.ts)의 모집 중 원정대 조회와 FK set null이 원정대 표 전체를 훑지 않게.
-- 원정대 행은 떠난 보스 것까지 계속 쌓인다. 0148 'missing fk index' 원칙과 같다. 부분 인덱스(guild_id is not null) — 해산 뒤 null이 된 행은 찾을 일이 없다.
begin;
set local lock_timeout = '3s';
create index if not exists world_boss_parties_guild_idx on world_boss_parties (guild_id) where guild_id is not null;
commit;
