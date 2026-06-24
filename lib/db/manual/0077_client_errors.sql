-- ───────────────────────────────────────────────────────────────────────────
-- 0077 클라이언트 에러 수집 — client_errors (SCHEMA §10.5).
--
-- /api/client-error가 fingerprint(kind:message)로 그룹화 적재(동일 에러 count 증가).
-- 미해결 동일 fingerprint는 부분 유니크로 1행. 어드민 패널 조회용. 멱등.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_errors (
  id          bigserial PRIMARY KEY,
  fingerprint text NOT NULL,
  kind        text NOT NULL,
  message     text NOT NULL,
  url         text,
  ua          text,
  stack       text,
  count       integer NOT NULL DEFAULT 1,
  resolved    boolean NOT NULL DEFAULT false,
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS client_errors_open_uq
  ON client_errors (fingerprint) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS client_errors_open_idx
  ON client_errors (resolved, last_seen);
