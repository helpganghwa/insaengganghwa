-- 공지 예약 발행 (2026-08-10) — 지정 시각에 초안이 자동 발행된다.
-- 지금까지 발행은 어드민이 직접 published를 켜는 수동 조작뿐이라, 오픈·업데이트 공지를
-- 그 시각에 사람이 깨어 있어야 올릴 수 있었다. 예약 우편(admin_scheduled_mails)과 같은 패턴.
--
-- 순수 추가(nullable) — 구코드는 컬럼을 몰라도 동작하므로 코드 배포와 순서 무관.
alter table public.announcements add column if not exists scheduled_at timestamptz;

-- 크론 조회 전용 부분 인덱스 — 대상은 '미발행 + 예약 있음'뿐이라 매우 작다.
create index if not exists announcements_sched_idx
  on public.announcements (scheduled_at)
  where published = false and scheduled_at is not null;

comment on column public.announcements.scheduled_at is
  '예약 발행 시각. published=false + 이 값 도래 시 scheduled-mail 크론이 발행으로 전환한다.';
