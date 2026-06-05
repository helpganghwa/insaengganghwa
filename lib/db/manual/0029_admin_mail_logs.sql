-- 0029 어드민 발송 감사 로그 — 누가/언제/무엇을 발송했는지 append-only.
-- 멱등(IF NOT EXISTS). 실행: bun run scripts/_apply-0029.ts
CREATE TABLE IF NOT EXISTS admin_mail_logs (
  id              bigserial PRIMARY KEY,
  admin_id        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  mode            text NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  target_label    text NOT NULL DEFAULT '',
  title           text NOT NULL DEFAULT '',
  body            text NOT NULL DEFAULT '',
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_mail_logs_created_idx ON admin_mail_logs (created_at);
