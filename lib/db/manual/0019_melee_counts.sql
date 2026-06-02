-- 0019 대난투 공격/방어 횟수 — MELEE §8 (1~3위 랭킹 섹션 stat).
-- 공유 Supabase 수동 적용.

ALTER TABLE melee_participants
  ADD COLUMN IF NOT EXISTS attack_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS defense_count integer NOT NULL DEFAULT 0;
