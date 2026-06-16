-- 0020_guild_intro.sql — 길드 소개(공개) 컬럼 (GUILD §1).
-- 목록(랭킹/검색) 팝업에 노출하는 공개 소개. 길드장/부길드장 편집. nullable·additive.

ALTER TABLE "guilds"
  ADD COLUMN IF NOT EXISTS "intro" text;
