-- 0173: 파견 귀환 푸시 — 원자 클레임 마킹(push-enhance-ready 패턴 미러).
alter table expeditions add column if not exists push_sent boolean not null default false;
-- 스캔 대상(진행 중·만기 도달·미발송)만 좁히는 부분 인덱스.
create index if not exists expeditions_push_ready_idx
  on expeditions (complete_at) where status = 'running' and push_sent = false;
