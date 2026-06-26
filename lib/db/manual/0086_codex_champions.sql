-- 0086_codex_champions.sql — 아이템별 강화랭킹 상위3 스냅샷(감사 S3). 멱등.
-- cron(leaderboard-snapshot heavy tick)이 (server)별 delete+insert로 교체.

create table if not exists codex_champions (
  server_id       smallint not null,
  catalog_item_id integer not null,
  user_id         uuid not null,
  rank            integer not null,
  updated_at      timestamptz not null default now(),
  primary key (server_id, catalog_item_id, rank)
);
create index if not exists codex_champions_user_idx on codex_champions (server_id, user_id);
