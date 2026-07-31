-- 0145: 익명 푸시 구독 허용(2026-07-31) — CBT 종료 화면 "오픈 알림 받기".
-- 종료 화면 유저는 로그아웃 상태라 user_id가 없다. endpoint UNIQUE는 유지되므로
-- 같은 기기가 나중에 로그인하면 PushAutoSync upsert가 user_id를 채워 입양한다.
alter table push_subscriptions alter column user_id drop not null;
