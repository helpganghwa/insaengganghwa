-- 0060 P5 월드 스코핑(SERVER.md §5) — 길드·점령전·zones·연대기. 멱등.
--   구 형태 제약은 legacy 보조로 유지(배포 전 구코드 무중단) → P6 정리에서 drop.

-- 1) 길드 — 서버 소속. 길드명은 서버별 유일(구 전역 unique는 전환기 유지 — P6 drop).
alter table guilds add column if not exists server_id smallint not null default 1 references servers(id);
create unique index if not exists guilds_server_name_uq on guilds (server_id, name);

-- 2) 멤버십/가입신청 — 1유저 1길드/1신청은 서버별.
alter table guild_members add column if not exists server_id smallint not null default 1 references servers(id);
do $$
declare pk text;
begin
  select conname into pk from pg_constraint where conrelid = 'guild_members'::regclass and contype = 'p';
  if pk is not null then execute format('alter table guild_members drop constraint %I', pk); end if;
  execute 'alter table guild_members add primary key (user_id, server_id)';
end $$;
create unique index if not exists guild_members_legacy_uq on guild_members (user_id);

alter table guild_join_requests add column if not exists server_id smallint not null default 1 references servers(id);
do $$
declare pk text;
begin
  select conname into pk from pg_constraint where conrelid = 'guild_join_requests'::regclass and contype = 'p';
  if pk is not null then execute format('alter table guild_join_requests drop constraint %I', pk); end if;
  execute 'alter table guild_join_requests add primary key (user_id, server_id)';
end $$;
create unique index if not exists guild_join_requests_legacy_uq on guild_join_requests (user_id);

-- 3) 탈퇴 24h 재가입 제한 — 서버별.
alter table guild_leave_log add column if not exists server_id smallint not null default 1;

-- 4) 월드 — zones는 서버별 월드(신서버 = 새 50행 시드, id는 전역 serial 영역).
alter table zones add column if not exists server_id smallint not null default 1 references servers(id);
create index if not exists zones_server_idx on zones (server_id);

-- 5) 점령전 — 배치 1인1일 유니크는 서버별. 전투는 zone 파생 + 명시 컬럼(조회 효율).
alter table guild_battle_deployments add column if not exists server_id smallint not null default 1 references servers(id);
drop index if exists deploy_user_day_uq;
create unique index if not exists deploy_user_day_uq
  on guild_battle_deployments (user_id, server_id, battle_kst_day);
create unique index if not exists deploy_user_day_legacy_uq
  on guild_battle_deployments (user_id, battle_kst_day);

alter table conquest_battles add column if not exists server_id smallint not null default 1 references servers(id);

-- 6) 연대기 — 서버별 일일 1행.
alter table world_chronicle add column if not exists server_id smallint not null default 1 references servers(id);
do $$
declare pk text;
begin
  select conname into pk from pg_constraint where conrelid = 'world_chronicle'::regclass and contype = 'p';
  if pk is not null then execute format('alter table world_chronicle drop constraint %I', pk); end if;
  execute 'alter table world_chronicle add primary key (server_id, kst_day)';
end $$;
create unique index if not exists world_chronicle_legacy_uq on world_chronicle (kst_day);
