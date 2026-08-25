-- 0172: 파견 v1 (EXPEDITION.md A′, 2026-08-25) — 미션 슬롯 상태머신 + 유저 상태.
-- 수치 정본은 lib/game/balance.ts EXPEDITION_* — 여기는 구조만.

create type expedition_difficulty as enum ('easy', 'normal', 'hard', 'grand');
create type expedition_status as enum ('offer', 'running', 'claimed', 'cancelled');

create table expeditions (
  id bigserial primary key,
  server_id smallint not null default 1,
  user_id uuid not null references profiles(id) on delete cascade,
  slot smallint not null,
  region zone_region not null,
  difficulty expedition_difficulty not null,
  duration_ms bigint not null,
  reward jsonb not null,
  status expedition_status not null default 'offer',
  rolled_at timestamptz not null default now(),
  avatar_profile_id uuid references user_profiles(id) on delete set null,
  synergy_bp integer not null default 0,
  level_bonus_bp integer not null default 0,
  final_reward jsonb,
  started_at timestamptz,
  complete_at timestamptz,
  reduced_ms bigint not null default 0,
  crit boolean,
  claimed_at timestamptz
);

-- 슬롯당 활성(offer/running) 1건 — 새로고침·시작·수령 경합의 정합 기반.
create unique index expeditions_one_active
  on expeditions (user_id, server_id, slot) where status in ('offer', 'running');
-- 파견 중 아바타는 한 곳에만.
create unique index expeditions_avatar_busy
  on expeditions (avatar_profile_id) where status = 'running' and avatar_profile_id is not null;
create index expeditions_user_status_idx on expeditions (user_id, server_id, status);

create table expedition_state (
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null default 1,
  xp bigint not null default 0,
  level integer not null default 0,
  slots_purchased smallint not null default 1,
  starts_kst_day date,
  starts_today smallint not null default 0,
  refresh_kst_day date,
  refresh_today smallint not null default 0,
  primary key (user_id, server_id)
);
