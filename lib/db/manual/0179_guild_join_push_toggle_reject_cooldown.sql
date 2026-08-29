-- 0179 길드 가입 신청 알림 토글 + 거절 후 재신청 대기 (2026-08-29, 문의 #148)
-- 가입 신청 접수 푸시(guild_join)를 끌 수 있는 개인 토글. 승인/거절 결과 푸시(guild)는 신청자 본인
-- 대상이라 그대로 상시 발송.
alter table profiles add column if not exists push_guild_join boolean not null default true;

-- 거절 기록 — 같은 길드에 GUILD_REAPPLY_COOLDOWN_HOURS 안에 재신청 불가(신청 스팸 차단).
-- 유저×서버×길드 1행, 거절할 때마다 rejected_at 갱신.
create table if not exists guild_join_rejections (
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null default 1,
  guild_id bigint not null references guilds(id) on delete cascade,
  rejected_at timestamptz not null default now(),
  primary key (user_id, server_id, guild_id)
);
