-- 0018 대난투 "내 전투" 미니로그 — MELEE §8 (등수·규모 무관 본인 전투 조회).
-- 공유 Supabase 수동 적용.

ALTER TABLE melee_participants
  ADD COLUMN IF NOT EXISTS my_events jsonb NOT NULL DEFAULT '[]'::jsonb;
