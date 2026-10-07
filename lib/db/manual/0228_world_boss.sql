-- 0228: 월드보스(2026-10-07, docs/WORLD-BOSS.md).
--  - world_bosses: 서버마다 하루 1마리(서버·KST 날짜 유니크). 0시에 '예정'(출현 시각 추첨)으로 만들고 크론이
--    출현(active)·종료(left)를 처리한다. 누적 피해·단계·쌓인 전리품은 이 행에 모은다.
--  - world_boss_parties: 원정대(점령 길드원이 만들고 누구나 참가, 최대 10명, 대장이 출발). 출발하면 전투 기록·피해·보상을 담는다.
--  - world_boss_party_members: 참가자. (boss_id, user_id) 유니크 = 보스 하나에 1인 1번. 모집 중 나가면 행을 지운다.
--  - world_boss_join_requests: 참가 신청(수락·거절은 대장).
--  - guilds.tax_pool_boxes: 길드 금고의 보급 상자 칸(부위 무관 총량, 3의 배수). 보스가 떠날 때 전리품이 💎와 함께 들어간다.
--  - profiles.push_world_boss: 월드보스 알림 토글.
-- 신설 표·칸뿐이라 코드보다 먼저 적용해도 무해. ⚠ 코드보다 **반드시 먼저** 적용할 것.
begin;
set local lock_timeout = '3s';

create table if not exists world_bosses (
  id bigserial primary key,
  server_id smallint not null,
  zone_id integer not null references zones(id) on delete cascade,
  region text not null,
  kst_day date not null,
  spawn_at timestamptz not null,
  leave_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'left')),
  total_damage bigint not null default 0 check (total_damage >= 0),
  stage integer not null default 0 check (stage >= 0),
  loot_diamond bigint not null default 0 check (loot_diamond >= 0),
  loot_boxes integer not null default 0 check (loot_boxes >= 0),
  spawn_owner_guild_id bigint references guilds(id) on delete set null,
  settled_guild_id bigint references guilds(id) on delete set null,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (server_id, kst_day)
);
create index if not exists world_bosses_server_status_idx on world_bosses (server_id, status);
alter table world_bosses enable row level security;

create table if not exists world_boss_parties (
  id bigserial primary key,
  boss_id bigint not null references world_bosses(id) on delete cascade,
  server_id smallint not null,
  leader_user_id uuid not null references profiles(id) on delete cascade,
  guild_id bigint not null references guilds(id) on delete cascade,
  status text not null default 'recruiting' check (status in ('recruiting', 'departed', 'disbanded')),
  created_at timestamptz not null default now(),
  departed_at timestamptz,
  disband_reason text,
  rounds integer not null default 0,
  damage bigint not null default 0 check (damage >= 0),
  stage_from integer,
  stage_to integer,
  finale jsonb,
  reward_diamond integer not null default 0,
  reward_boxes integer not null default 0,
  depart_key uuid
);
create index if not exists world_boss_parties_boss_idx on world_boss_parties (boss_id, status);
create index if not exists world_boss_parties_leader_idx on world_boss_parties (leader_user_id);
create unique index if not exists world_boss_parties_depart_key_uq on world_boss_parties (depart_key) where depart_key is not null;
alter table world_boss_parties enable row level security;

create table if not exists world_boss_party_members (
  party_id bigint not null references world_boss_parties(id) on delete cascade,
  boss_id bigint not null references world_bosses(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null,
  joined_at timestamptz not null default now(),
  attacks integer not null default 0,
  damage bigint not null default 0,
  fell_round integer,
  primary key (party_id, user_id),
  unique (boss_id, user_id)
);
create index if not exists world_boss_party_members_user_idx on world_boss_party_members (user_id);
alter table world_boss_party_members enable row level security;

create table if not exists world_boss_join_requests (
  party_id bigint not null references world_boss_parties(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (party_id, user_id)
);
create index if not exists world_boss_join_requests_user_idx on world_boss_join_requests (user_id, status);
alter table world_boss_join_requests enable row level security;

alter table guilds add column if not exists tax_pool_boxes integer not null default 0;
alter table profiles add column if not exists push_world_boss boolean not null default true;

commit;
