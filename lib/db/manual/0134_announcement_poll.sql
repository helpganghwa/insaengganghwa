-- 0134 공지 투표 — 공지에 poll(jsonb) + 1인 1표 투표 테이블.
-- 결과·투표자는 관리자만 열람(유저 집계 미노출), 투표 변경 가능(PK upsert), 마감일 선택(poll.closesAtIso).
alter table announcements add column poll jsonb;

create table announcement_poll_votes (
  announcement_id bigint not null references announcements(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  option_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
create index announcement_poll_votes_ann_idx on announcement_poll_votes (announcement_id);
