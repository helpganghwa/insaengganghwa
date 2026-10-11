-- 0240 길드 세금 분배 기록에 📦 칸(10-11 3차 결정 ⑦): 💎·📦 통합 분배(4409843c)로 📦만 나눈 분배가 total 0으로 남던 것.
-- 멱등. 기존 행은 0(분배 당시 상자 분배가 없었거나 기록되지 않음).
begin;
set local lock_timeout = '3s';
alter table guild_tax_distributions add column if not exists boxes integer not null default 0;
commit;
