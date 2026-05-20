-- 0003_mailbox_v1.sql
-- 우편함 v1 — mailbox 확장 + mail_claim_logs + profiles.is_admin.
-- 적용: DIRECT_URL postgres.js 트랜잭션(이전 수동 패턴 동일).
-- 멱등: 모든 ADD/CREATE는 IF NOT EXISTS, enum value도 IF NOT EXISTS.

-- 1) mailbox 컬럼 확장
ALTER TABLE mailbox ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE mailbox ADD COLUMN IF NOT EXISTS body text NOT NULL DEFAULT '';
ALTER TABLE mailbox ADD COLUMN IF NOT EXISTS sender_label text NOT NULL DEFAULT '시스템';
ALTER TABLE mailbox
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days');

-- 2) mailbox_type enum에 'admin' 추가
ALTER TYPE mailbox_type ADD VALUE IF NOT EXISTS 'admin';

-- 3) profiles.is_admin
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 4) mail_claim_logs (감사)
CREATE TABLE IF NOT EXISTS mail_claim_logs (
  id bigserial PRIMARY KEY,
  mail_id bigint REFERENCES mailbox(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  diamond_granted bigint NOT NULL DEFAULT 0,
  boxes_granted jsonb NOT NULL DEFAULT '{}'::jsonb,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

-- 5) 미수령·미만료 빠른 조회 인덱스(partial). 기존 (user_id, claimed_at)도 유지.
CREATE INDEX IF NOT EXISTS mailbox_user_unclaimed_idx
  ON mailbox(user_id, expires_at)
  WHERE claimed_at IS NULL;
