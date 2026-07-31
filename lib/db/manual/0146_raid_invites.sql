-- 0146: 레이드 지목 초대(2026-07-31)
--
-- 개설자가 친구·길드원을 지목해 초대한다. 초대는 **참여 허가**이므로 수락 승인이 없다
-- (초대 자체가 개설자의 의사 표시 — 초대→요청→수락 왕복 2회를 1회로).
-- 정원 마감은 별개 — 초대를 여럿에게 보내고 선착순으로 채우는 운용을 허용하므로
-- 초대 인원에 상한을 두지 않고, 실제 참여 시 joinRaid의 RAID_FULL 가드가 판정한다.
create table if not exists raid_invites (
  id            bigserial primary key,
  raid_id       bigint not null references raids(id) on delete cascade,
  -- 초대한 사람(개설자). 조회·표시용.
  inviter_user_id uuid not null references profiles(id) on delete cascade,
  -- 초대받은 사람.
  invitee_user_id uuid not null references profiles(id) on delete cascade,
  created_at    timestamptz not null default now()
);

-- 중복 초대 차단 — 같은 레이드·같은 대상은 1회(초대 팝업의 '초대함' 표시 근거).
create unique index if not exists raid_invite_uq on raid_invites (raid_id, invitee_user_id);
-- 받은 초대 조회(레이드 화면 '초대받은 레이드' 섹션) — 최신순.
create index if not exists raid_invite_invitee_idx on raid_invites (invitee_user_id, created_at desc);
