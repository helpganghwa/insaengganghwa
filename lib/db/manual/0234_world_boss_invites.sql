-- 0234 월드보스 원정대 초대(docs/WORLD-BOSS.md §2, 2026-10-11 사용자 2안)
-- 원정대장이 친구·길드원을 초대하고, 상대가 수락하면 신청·수락 없이 바로 참가한다. 한 원정대에 한 사람 한 줄(거절 뒤 다시 초대하면 같은 줄을 pending으로 되돌린다).
begin;
set local lock_timeout = '3s';

create table if not exists world_boss_invites (
  party_id bigint not null references world_boss_parties(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  from_user_id uuid references profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (party_id, user_id)
);
create index if not exists world_boss_invites_user_idx on world_boss_invites (user_id, status);
alter table world_boss_invites enable row level security;

commit;
