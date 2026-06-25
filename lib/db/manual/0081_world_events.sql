-- 0081_world_events.sql — 월드 이벤트 피드(홈 하단) + 랭킹 1위 추적
-- 멱등(IF NOT EXISTS). apply: bun run scripts/apply-migration.ts lib/db/manual/0081_world_events.sql

create table if not exists world_events (
  id            bigserial primary key,
  server_id     smallint not null default 1,
  type          text not null,
  actor_user_id uuid,
  guild_id      bigint,
  detail        jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists world_events_feed_idx on world_events (server_id, created_at);

create table if not exists ranking_leaders (
  server_id  smallint not null,
  metric     text not null,
  user_id    uuid not null,
  updated_at timestamptz not null default now(),
  primary key (server_id, metric)
);
