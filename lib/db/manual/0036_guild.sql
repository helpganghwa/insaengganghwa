-- 0036 길드 — 협력 성장 + 월드맵 점령전 (GUILD.md §1~§5.6). 멱등. 실행: bun run scripts/_apply-0036.ts
-- ⚠ 길드는 "마지막 콘텐츠"(출시·DAU 이후 투입). 적용 시점 신중히 — 적용 전엔 스키마 inert.
-- ⚠ zones 50구역 시드(외곽 4지역 각 11 + 중앙 6)는 worldmap 좌표 배치 후 별도 INSERT로 처리(맨 아래 참조).

-- ── enums ──
DO $$ BEGIN CREATE TYPE guild_role AS ENUM ('leader','vice','member'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE zone_region AS ENUM ('volcano','temple','swamp','sky','orc'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE guild_deploy_role AS ENUM ('attack','defend'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── guilds — 이름(불변)·문양·공지·레벨(0+무제한)·xp·세금풀·길드장 ──
CREATE TABLE IF NOT EXISTS guilds (
  id              bigserial PRIMARY KEY,
  name            text NOT NULL UNIQUE,
  emblem_url      text,
  emblem_color    text,
  notice          text,
  level           integer NOT NULL DEFAULT 0,
  xp              bigint  NOT NULL DEFAULT 0,
  tax_pool_points bigint  NOT NULL DEFAULT 0,
  leader_user_id  uuid    NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── guild_members — user_id PK = 1유저 1길드 ──
CREATE TABLE IF NOT EXISTS guild_members (
  user_id               uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  guild_id              bigint NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  role                  guild_role NOT NULL DEFAULT 'member',
  contribution_points   bigint  NOT NULL DEFAULT 0,
  daily_donation_count  integer NOT NULL DEFAULT 0,
  last_donation_kst_day date,
  joined_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guild_member_guild_idx ON guild_members (guild_id);

-- ── guild_leave_log — 24h 재가입 제한(가장 최근 left_at 기준) ──
CREATE TABLE IF NOT EXISTS guild_leave_log (
  id      bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  left_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guild_leave_user_idx ON guild_leave_log (user_id, left_at);

-- ── zones — 50구역(시드 고정 id). 좌표만(인접은 zone_adjacency). owner/lord nullable=중립 ──
CREATE TABLE IF NOT EXISTS zones (
  id                    integer PRIMARY KEY,
  region                zone_region NOT NULL,
  name                  text NOT NULL,
  map_x                 real NOT NULL,
  map_y                 real NOT NULL,
  owner_guild_id        bigint REFERENCES guilds(id) ON DELETE SET NULL,
  lord_user_id          uuid   REFERENCES profiles(id) ON DELETE SET NULL,
  tax_points            bigint NOT NULL DEFAULT 0,
  last_tax_collected_at timestamptz,
  captured_at           timestamptz
);
CREATE INDEX IF NOT EXISTS zone_owner_idx ON zones (owner_guild_id);

-- ── zone_adjacency — 현재 미사용(인접 규칙 없음)·미래 대비. 정규형 a<b ──
CREATE TABLE IF NOT EXISTS zone_adjacency (
  zone_a integer NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  zone_b integer NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  PRIMARY KEY (zone_a, zone_b),
  CONSTRAINT zone_adj_canonical CHECK (zone_a < zone_b)
);

-- ── guild_battle_deployments — 1인 1배치/일(KST), 12:00 잠금. 영주는 자동 방어(미기록) ──
CREATE TABLE IF NOT EXISTS guild_battle_deployments (
  id             bigserial PRIMARY KEY,
  battle_kst_day date    NOT NULL,
  user_id        uuid    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  guild_id       bigint  NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  zone_id        integer NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  role           guild_deploy_role NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS deploy_user_day_uq ON guild_battle_deployments (user_id, battle_kst_day);
CREATE INDEX IF NOT EXISTS deploy_zone_day_idx ON guild_battle_deployments (zone_id, battle_kst_day);

-- ── conquest_battles — 구역×일 1전투(결정론 팀전). finale=참가자·전투력·리플레이 ──
CREATE TABLE IF NOT EXISTS conquest_battles (
  id              bigserial PRIMARY KEY,
  battle_kst_day  date    NOT NULL,
  zone_id         integer NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  winner_guild_id bigint  REFERENCES guilds(id) ON DELETE SET NULL,
  finale          jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS conquest_zone_day_uq ON conquest_battles (zone_id, battle_kst_day);

-- ── profiles.residence_zone_id — 거주 구역(§5.5) + FK(순환 회피로 여기서 ALTER) ──
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS residence_zone_id integer;
DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_residence_zone_fk
    FOREIGN KEY (residence_zone_id) REFERENCES zones(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS profiles_residence_zone_idx ON profiles (residence_zone_id);

-- ── zones 50구역 시드 → 0037_zones_seed.sql (좌표 배치 완료, 별도 적용) ──
