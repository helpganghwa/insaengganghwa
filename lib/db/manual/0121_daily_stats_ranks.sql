-- 0121 오늘의 인생강화 — 최고/합산 랭킹 스냅샷 추가(랭킹 변화 3지표·추이 그래프, 2026-07-16)
alter table user_daily_stats add column if not exists max_rank int;
alter table user_daily_stats add column if not exists sum_rank int;
