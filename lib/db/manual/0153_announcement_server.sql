-- 공지 서버별 대상(2026-08-07) — 어드민이 서버 선택(null=전서버)으로 공지를 게시.
alter table public.announcements add column if not exists server_id smallint;
comment on column public.announcements.server_id is 'null=전서버, 값=해당 서버에만 노출';
