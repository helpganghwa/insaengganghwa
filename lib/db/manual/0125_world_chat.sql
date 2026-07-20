-- 0125: 월드 채팅(2026-07-20) — 서버별 공개 채팅 + 신고 + 채팅 금지.
-- 보존: 서버당 최근 1,000개 + 7일(크론 정리). 숨김 = 신고 3건 자동 또는 어드민.
CREATE TABLE IF NOT EXISTS chat_messages (
  id bigserial PRIMARY KEY,
  server_id smallint NOT NULL,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_msg_server_id_idx ON chat_messages (server_id, id DESC);

CREATE TABLE IF NOT EXISTS chat_reports (
  message_id bigint NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, reporter_user_id)
);

-- 채팅 금지(계정 전역) — null=정상, 미래 시각=금지 중.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS chat_muted_until timestamptz;
