-- 0043 길드 가입 방식(자유/승인) + 가입 신청 테이블. 멱등. 실행: bun run scripts/_apply-0043.ts
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS join_policy text NOT NULL DEFAULT 'open';

CREATE TABLE IF NOT EXISTS guild_join_requests (
  user_id    uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  guild_id   bigint NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guild_join_req_guild_idx ON guild_join_requests (guild_id);
