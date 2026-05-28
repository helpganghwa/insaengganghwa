-- 0017_profile_background.sql — 프로필 배경 (PROFILE §8).
-- 전역 1개 활성 배경 key. 캐릭터와 무관하게 대표 카드·OG·랭킹에 공통 적용.
-- key는 lib/game/profile/backgrounds.ts의 화이트리스트. null = 배경 없음.

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "active_background" text;
