-- 0068 성장 프리미엄 일일 보상 멱등 테이블. 멱등(IF NOT EXISTS).
--   ensurePremiumDailyMail(lib/game/mailbox/premium-daily.ts)이 활성 프리미엄 보유자에게
--   KST 자정 기준 1회 일일 보상 우편을 발송할 때, (user_id, server_id, kst_day) PK로
--   중복/동시 발송을 차단한다(daily_supply_grants와 동일 패턴).
--   ⚠ ensurePremiumDailyMail를 호출하는 새 layout 코드 배포 전/동시에 적용(미적용 시 그 쿼리
--     실패 — 단, layout에서 try/catch로 감싸 로그인은 진행됨).

create table if not exists public.premium_daily_grants (
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  server_id  smallint    not null default 1,
  kst_day    date        not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, server_id, kst_day)
);
