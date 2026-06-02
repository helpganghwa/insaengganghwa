-- 0020 대난투 총 라운드 — finale 이벤트 실제 라운드 번호 역산용. 공유 Supabase 수동 적용.

ALTER TABLE melee_battles
  ADD COLUMN IF NOT EXISTS total_rounds integer NOT NULL DEFAULT 0;
