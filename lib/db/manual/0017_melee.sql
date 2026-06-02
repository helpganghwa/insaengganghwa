-- 0017 대난투 (Grand Melee) — MELEE.md / SCHEMA §13
-- 공유 Supabase 수동 적용. enum ADD VALUE가 같은 트랜잭션 내 사용 제약에 걸리면
-- (1)만 먼저 단독 실행 후 나머지 실행.

-- 1) push_category 에 'melee' 추가 (런타임 발송 카테고리)
ALTER TYPE push_category ADD VALUE IF NOT EXISTS 'melee';

-- 2) profiles 대난투 푸시 토글 (기본 ON)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_melee boolean NOT NULL DEFAULT true;

-- 3) 대난투 배틀 상태 enum
DO $$ BEGIN
  CREATE TYPE melee_status AS ENUM ('running', 'computed', 'revealed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) melee_battles — 하루 1행 (battle_date UNIQUE 멱등)
CREATE TABLE IF NOT EXISTS melee_battles (
  id                bigserial PRIMARY KEY,
  battle_date       date NOT NULL UNIQUE,
  seed              text NOT NULL,
  status            melee_status NOT NULL DEFAULT 'running',
  participant_count integer NOT NULL DEFAULT 0,
  champion_user_id  uuid REFERENCES profiles(id),
  finale            jsonb NOT NULL DEFAULT '{"roster":[],"events":[]}'::jsonb,
  computed_at       timestamptz,
  revealed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 5) melee_participants — 참가자×배틀 1행 (로스터=결과 통합)
CREATE TABLE IF NOT EXISTS melee_participants (
  battle_id      bigint NOT NULL REFERENCES melee_battles(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cp_snapshot    bigint NOT NULL,
  final_rank     integer NOT NULL,
  killer_user_id uuid,
  reward_diamond bigint NOT NULL DEFAULT 0,
  reward_boxes   jsonb NOT NULL,
  PRIMARY KEY (battle_id, user_id)
);
CREATE INDEX IF NOT EXISTS melee_part_rank_idx ON melee_participants (battle_id, final_rank);
