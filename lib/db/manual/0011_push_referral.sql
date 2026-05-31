-- 0011 카카오 공유 가입 보상 푸시 — push_category 'referral' + profiles.push_referral.
-- 멱등: ENUM value는 IF NOT EXISTS / 컬럼은 ADD COLUMN IF NOT EXISTS.

ALTER TYPE push_category ADD VALUE IF NOT EXISTS 'referral';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS push_referral BOOLEAN NOT NULL DEFAULT true;
