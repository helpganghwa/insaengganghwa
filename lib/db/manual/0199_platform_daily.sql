-- 0199: 플랫폼별 일일 접속 + 클라 에러 플랫폼 태그 (2026-09-14)
--
-- 플레이스토어 출시 뒤 앱(TWA)·PWA·웹 DAU를 구분해 보기 위한 표. 접속 하트비트(/api/presence)가
-- 클라가 판정한 플랫폼을 하루 1행으로 적재한다(twa = 앱 진입 세션 표식, pwa = display-mode standalone,
-- 그 외 web). 쿠키 ig_platform은 앱과 크롬이 저장소를 공유해 새므로 통계에도 쓰지 않는다.
-- 통계 전용 — 보상·확률 등 게임 로직에 쓰지 않는다. 한 유저가 하루에 두 플랫폼을 쓰면 두 행이다.
create table if not exists platform_daily (
  kst_day date not null,
  server_id smallint not null default 1,
  user_id uuid not null,
  platform text not null check (platform in ('twa', 'pwa', 'web')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (kst_day, server_id, user_id, platform)
);
create index if not exists platform_daily_day_idx on platform_daily (kst_day, platform);

-- 클라 에러에 발생 플랫폼을 남긴다 — 앱 전용 오류를 걸러 보기 위해(어드민 목록 ua 앞에 표시).
alter table client_errors add column if not exists platform text;
