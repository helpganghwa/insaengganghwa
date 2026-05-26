-- 강화 잡 '최대확률 도달' 알림 1회 보장 게이트 (2026-05-26)
-- 알림 의도 재정의: 결과 시점 X → complete_at 도달(=최대확률) 시점에 1회.

ALTER TABLE "enhancement_jobs"
  ADD COLUMN IF NOT EXISTS "push_sent" boolean NOT NULL DEFAULT false;

-- 매 5분 cron이 빠르게 조회할 partial index — running + 미발송 + complete_at 정렬.
CREATE INDEX IF NOT EXISTS "ej_push_ready_idx"
  ON "enhancement_jobs" ("complete_at")
  WHERE status = 'running' AND push_sent = false;
