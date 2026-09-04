-- 0191: 칭호 발견 보상(2026-09-04, 유저 건의) — 발견 1개당 💎20, 발견 50개마다 그 개수만큼 보급 상자.
--  칭호 화면의 "받을 보상" 바에서 직접 [모두 받기]로 수령한다(자동 지급·우편 없음).
--  - user_titles.reward_claimed_at: NULL = 미수령. 기존 보유분도 NULL 그대로 두어 첫 방문 때 한꺼번에
--    수령한다 — 소급 우편이 필요 없다(사용자 결정). 0187의 seen_at(확인)과는 별개 축.
--  - title_milestone_claims: 발견 개수 달성(50·100·…) 상자 수령 기록. PK로 멱등.
begin;

alter table user_titles add column if not exists reward_claimed_at timestamptz;
create index if not exists user_titles_unclaimed_idx on user_titles (user_id, server_id) where reward_claimed_at is null;

create table if not exists title_milestone_claims (
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null,
  count int not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, server_id, count)
);

commit;
