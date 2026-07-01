-- 0090 고객센터 문의 (인앱 접수 → 관리자 답변). 양쪽 DB(prod/staging)에 1회 적용.
-- enum은 재적용 안전을 위해 DO 블록으로 감쌈(중복 시 무시).
DO $$ BEGIN
  CREATE TYPE support_inquiry_type AS ENUM ('payment', 'bug', 'account', 'etc');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE support_inquiry_status AS ENUM ('open', 'answered');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS support_inquiries (
  id                  bigserial PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  server_id           smallint NOT NULL DEFAULT 1,
  type                support_inquiry_type NOT NULL,
  body                text NOT NULL,
  status              support_inquiry_status NOT NULL DEFAULT 'open',
  answer_body         text,
  answered_by_user_id uuid,
  answered_at         timestamptz,
  context_snapshot    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_inquiries_status_created_idx ON support_inquiries (status, created_at DESC);
CREATE INDEX IF NOT EXISTS support_inquiries_user_idx ON support_inquiries (user_id);
