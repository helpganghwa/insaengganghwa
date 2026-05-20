-- 0004_daily_supply.sql
-- 일일 보급 메일 멱등 가드 — (user_id, kst_day) PK.
-- ensureDailyMail()이 lazy 발송. cron 의존 X.
CREATE TABLE IF NOT EXISTS daily_supply_grants (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kst_day date NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kst_day)
);
