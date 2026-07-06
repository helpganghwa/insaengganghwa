-- 개인 기록 마일스톤 워터마크(2026-07-06).
-- 합산강화 1000단위 / 전투력 10^n(10만~) / 레이드 처치 100단위 / 대난투 우승 10단위 달성을
-- 월드·길드 로그로 남기기 위한 단조 워터마크 — 스냅샷 cron이 값 계산 시 교차 감지, 중복 발화 차단.
CREATE TABLE IF NOT EXISTS user_milestones (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  server_id smallint NOT NULL,
  metric text NOT NULL,
  milestone bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, server_id, metric)
);
