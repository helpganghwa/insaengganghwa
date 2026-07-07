-- 0111: cron_heartbeats — 크론 dead-man(생존 감시)
-- 각 크론이 성공 완료 시 last_success_at을 갱신(beatCron). warm 워치독과 어드민 대시보드가
-- now()-last_success_at이 크론별 허용 간격을 넘으면 정지로 판정 → 알림/빨강 표시.
-- 크론이 던지거나(에러) 아예 안 돌아도(CRON_SECRET 사고·미스케줄) beat가 안 와 자동 감지된다.
-- stale_alerted_at: warm 워치독 알림 디듀프(정지 지속 중 1시간 1회만 알림, 회복 시 beatCron이 null로 리셋).
create table if not exists public.cron_heartbeats (
  name             text primary key,
  last_success_at  timestamptz not null default now(),
  detail           text,
  stale_alerted_at timestamptz
);

-- 감시 대상 9종을 now()로 시드 — 배포 직후 아직 안 돈 크론(특히 daily 창 크론)이 즉시
-- stale 오탐/스퓨리어스 알림 나지 않게 유예를 준다. 각 크론은 다음 성공에서 자기 행을 갱신.
insert into public.cron_heartbeats (name) values
  ('warm'), ('push-enhance-ready'), ('profile-poll'), ('push-flush'),
  ('settle-raid'), ('payment-recon'), ('push-daily-supply'), ('melee-run'), ('conquest-run')
on conflict (name) do nothing;
