-- 0041 길드 세금 분배 로그(공개) — GUILD §5.5. 멱등. 실행: bun run scripts/_apply-0041.ts. 선행: 0036.
CREATE TABLE IF NOT EXISTS guild_tax_distributions (
  id             bigserial PRIMARY KEY,
  guild_id       bigint NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  by_user_id     uuid   NOT NULL REFERENCES profiles(id),
  mode           text   NOT NULL, -- 'equal' | 'target'
  total          bigint NOT NULL,
  target_user_id uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guild_tax_dist_idx ON guild_tax_distributions (guild_id, created_at);
