-- ───────────────────────────────────────────────────────────────────────────
-- 0025 배틀패스 — 성장 패스(강화/초월, 만료 없음). 수령 high-water 모델(SCHEMA §14 / BALANCE §9).
-- 추가형·멱등.
-- ───────────────────────────────────────────────────────────────────────────

do $$ begin
  create type battlepass_type as enum ('enhance', 'transcend');
exception when duplicate_object then null; end $$;

create table if not exists public.battlepass_state (
  user_id uuid not null references public.profiles(id) on delete cascade,
  pass_type battlepass_type not null,
  free_claimed_through integer not null default 0,
  primary key (user_id, pass_type)
);

create table if not exists public.battlepass_segments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  pass_type battlepass_type not null,
  segment_index integer not null,
  premium_claimed_through integer not null default 0,
  purchased_at timestamptz not null default now(),
  primary key (user_id, pass_type, segment_index)
);
