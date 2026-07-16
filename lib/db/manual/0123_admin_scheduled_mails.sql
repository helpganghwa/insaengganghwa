-- 0123 운영자 우편 예약 전송(2026-07-16) — 전체 발송 예약. 크론(scheduled-mail, 5분)이
-- 도래분을 클레임(sent_at 조건부 스탬프)해 발송 — 멱등.
create table if not exists admin_scheduled_mails (
  id bigserial primary key,
  admin_id uuid not null,
  title text not null,
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  push boolean not null default false,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists admin_sched_due_idx on admin_scheduled_mails (scheduled_at) where sent_at is null and canceled_at is null;
