-- 0124: 아바타 보관함 확장(2026-07-20 BM) — 기본 한도 10칸 + 확장 구매분(칸당 300💎).
-- 한도 = min(PROFILE_MAX 100, PROFILE_BASE_SLOTS 10 + avatar_slot_bonus). 서버별 자산(characters).
ALTER TABLE characters ADD COLUMN IF NOT EXISTS avatar_slot_bonus integer NOT NULL DEFAULT 0;
