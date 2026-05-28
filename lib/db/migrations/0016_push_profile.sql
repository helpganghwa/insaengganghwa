-- 0016_push_profile.sql — 프로필 검토 완료 push 알림 (PROFILE §5.4).
-- push_category enum에 'profile' 추가 + profiles.push_profile 토글 컬럼(기본 ON).

ALTER TYPE "push_category" ADD VALUE IF NOT EXISTS 'profile';

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "push_profile" boolean NOT NULL DEFAULT true;
