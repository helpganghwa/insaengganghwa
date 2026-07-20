-- 0126: 채팅 차단 서버 저장 — 기기 로컬(localStorage) 차단을 계정 귀속으로 전환.
-- 조회는 (user_id) PK 앞머리로 커버. 닉네임은 저장하지 않고 조회 시 characters 조인.
create table if not exists chat_blocks (
  user_id uuid not null references profiles(id) on delete cascade,
  blocked_user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_user_id)
);
