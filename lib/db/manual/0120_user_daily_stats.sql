-- 0120 오늘의 인생강화(2026-07-16) — KST 자정 유저 지표 스냅샷(어제와 비교의 기준선).
-- 자정 크론이 leaderboard_ranks를 피벗해 기록. 3일 이후 행은 크론이 정리(용량 유계).
create table if not exists user_daily_stats (
  user_id uuid not null,
  server_id smallint not null,
  kst_day date not null,
  combat bigint not null default 0,
  max_enhance bigint not null default 0,
  sum_enhance bigint not null default 0,
  combat_rank int,
  primary key (user_id, server_id, kst_day)
);
