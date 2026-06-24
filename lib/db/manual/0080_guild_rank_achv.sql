-- ───────────────────────────────────────────────────────────────────────────
-- 0080 길드 랭킹 업적 — guilds.last_power_rank / last_zone_rank.
--
-- 전투력·점령지 랭킹 1~3위 업적을 길드 피드에 노출(rank-achievements cron). 직전 랭크를
-- 저장해 변동 시에만 기록(매일 중복 로깅 방지). 멱등.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE guilds ADD COLUMN IF NOT EXISTS last_power_rank smallint;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS last_zone_rank  smallint;
