-- 0217 — 길드 기여도 보관(2026-09-25, feat/update-small-12). 문의 #331(Eclipse).
-- 기여도는 guild_members 행에 붙어 있어 탈퇴·추방으로 행이 지워지면 함께 사라졌다. 같은 길드에 다시 들어오면
-- 0부터 쌓였다. 이제 나갈 때 그 길드에서 쌓은 기여도를 여기에 보관하고, 같은 길드에 재가입하면 되돌려 넣는다
-- (탈퇴·추방 모두, lib/game/guild/contribution-stash.ts). 길드가 해산돼 guilds 행이 지워지면 보관분도 함께 지워진다.
-- 이 테이블 이전에 끊긴 기여도는 기록이 없어 복원하지 않는다(사용자 결정 09-25).
-- 추가 전용 — 코드 배포 **전에** 적용한다(탈퇴·추방·가입 트랜잭션이 이 테이블을 쓴다).
create table if not exists guild_contribution_stash (
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null,
  guild_id bigint not null references guilds(id) on delete cascade,
  contribution_points bigint not null default 0,
  left_at timestamptz not null default now(),
  primary key (user_id, server_id, guild_id)
);
create index if not exists guild_contribution_stash_guild_idx on guild_contribution_stash (guild_id);
