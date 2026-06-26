-- 0084_leaderboard_ranks.sql — 리더보드 사전계산 스냅샷(감사 M7). 멱등.
-- cron(leaderboard-snapshot)이 N분마다 (server,metric)별로 delete+insert(원자 교체).

create table if not exists leaderboard_ranks (
  server_id  smallint not null,
  metric     text not null,
  user_id    uuid not null,
  value      bigint not null,
  rank       int not null,
  updated_at timestamptz not null default now(),
  primary key (server_id, metric, user_id)
);
create index if not exists leaderboard_ranks_top_idx   on leaderboard_ranks (server_id, metric, rank);
create index if not exists leaderboard_ranks_value_idx on leaderboard_ranks (server_id, metric, value);
