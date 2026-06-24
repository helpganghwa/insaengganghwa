-- ───────────────────────────────────────────────────────────────────────────
-- 0041 결제 사고 감지/알림 — payment_alerts (PAYMENT-SAFETY.md §9.5)
--
-- 인라인(웹훅)·정합성 cron이 위험 이벤트를 영속 기록. 미해결 동일 (kind, payment_id)는
-- 부분 유니크로 1회만(중복 알림 방지). 멱등 — 재적용 안전.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_alerts (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL,
  severity    text NOT NULL,
  payment_id  text NOT NULL DEFAULT '',
  order_id    bigint REFERENCES iap_orders(id),
  detail      text NOT NULL,
  resolved    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- 미해결 동일 (kind, payment_id) 중복 차단(부분 유니크) — resolved 후 재발은 새 row 허용.
CREATE UNIQUE INDEX IF NOT EXISTS payment_alerts_open_uq
  ON payment_alerts (kind, payment_id) WHERE resolved = false;

-- 어드민 패널 — 미해결 최신순.
CREATE INDEX IF NOT EXISTS payment_alerts_open_idx
  ON payment_alerts (resolved, created_at);
