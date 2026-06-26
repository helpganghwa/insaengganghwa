-- 0082_announcements.sql — 전역 공지사항(게시판). 멱등(IF NOT EXISTS).
-- apply: bun run scripts/apply-migration.ts lib/db/manual/0082_announcements.sql

create table if not exists announcements (
  id           bigserial primary key,
  category     text not null default 'notice',
  title        text not null,
  body         text not null,
  pinned       boolean not null default false,
  published    boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists announcements_pub_idx on announcements (published, published_at);
