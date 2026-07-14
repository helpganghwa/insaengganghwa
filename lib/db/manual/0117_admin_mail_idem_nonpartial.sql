-- 0117: 전체우편 멱등키 인덱스 partial → non-partial (2026-07-14)
-- 0110의 partial unique(where idempotency_key is not null)는 ON CONFLICT (idempotency_key)의
-- arbiter로 추론되지 않아(42P10) broadcast가 전면 실패했음(첫 실사용에서 발견).
-- UNIQUE는 NULL끼리 충돌하지 않으므로(NULLS DISTINCT 기본) partial일 필요가 없다. 멱등(IF EXISTS).

DROP INDEX IF EXISTS admin_mail_logs_idem_uq;
CREATE UNIQUE INDEX IF NOT EXISTS admin_mail_logs_idem_uq
  ON admin_mail_logs (idempotency_key);
