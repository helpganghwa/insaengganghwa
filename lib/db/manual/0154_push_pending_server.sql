-- 푸시 그룹화 큐 서버 귀속 (2026-08-07 서버분리 감사 A6) — SERVER.md 경계규칙 1.
-- 적재는 push-enhance-ready cron이 last_server_id = job.server_id일 때만 하지만,
-- 30~60분 묶음 윈도 사이에 유저가 서버를 옮기면 flush가 이전 서버 이벤트를 지금 서버
-- 알림처럼 발송했다. 행에 서버를 박아 flush 시점에 활성 서버 일치를 재확인한다.
--
-- 순수 추가(nullable) — 구코드는 컬럼을 몰라도 동작하므로 코드 배포와 순서 무관.
alter table public.push_pending add column if not exists server_id smallint;

-- 기존 대기 행 백필 — 적재 시점 필터(활성 서버=잡 서버) 특성상 last_server_id로 근사해도 정확.
update public.push_pending pp
set server_id = p.last_server_id
from public.profiles p
where p.id = pp.user_id
  and pp.server_id is null;
