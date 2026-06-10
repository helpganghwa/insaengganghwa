-- 0045 레이드: 공개 범위별 참가 모드(자유/수락) + 공유링크 참가요청. 멱등.
--
--  friend_share / guild_share: 'off'(비공개) | 'free'(목록에서 즉시 참가) | 'approval'(요청→개설자 수락)
--    - 친구/길드 목록 노출 + 그 안에서의 참가 방식을 호스트가 선택.
--  공유링크(/raid-invite) 참가는 항상 '수락'(요청) — 링크 유출 대비.
--  raid_join_requests: pending|approved|rejected. (raid_id,user_id) UNIQUE — 재요청은 pending 갱신.

alter table raids add column if not exists friend_share text not null default 'off';
alter table raids add column if not exists guild_share  text not null default 'off';

-- 기존 visible_to_friends(=즉시 참가) → friend_share 'free' 백필.
update raids set friend_share = 'free' where visible_to_friends = true and friend_share = 'off';

-- 0045 초안에서 추가했던 boolean은 mode 컬럼으로 대체 → 제거.
alter table raids drop column if exists visible_to_guild;

create table if not exists raid_join_requests (
  id          bigserial primary key,
  raid_id     bigint not null references raids(id) on delete cascade,
  user_id     uuid   not null references profiles(id) on delete cascade,
  status      text   not null default 'pending',
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);

create unique index if not exists raid_join_request_uq on raid_join_requests (raid_id, user_id);
create index if not exists raid_join_request_pending_idx on raid_join_requests (raid_id) where status = 'pending';
