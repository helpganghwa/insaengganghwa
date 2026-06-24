-- ───────────────────────────────────────────────────────────────────────────
-- 0076 강화 downRate 스냅샷 — enhancement_jobs.down_rate_bp.
--
-- baseRate처럼 downRate도 등록 시점 스냅샷(소급 금지, CLAUDE §6.3). 기존 in-flight 잡은
-- null로 남아 resolve가 코드상수로 폴백(점진 마이그레이션). 멱등.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE enhancement_jobs ADD COLUMN IF NOT EXISTS down_rate_bp integer;
