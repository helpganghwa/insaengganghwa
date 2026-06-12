-- 0055 서버(논리 분리) 기반 — SERVER.md §2. 계정(전역)/캐릭터(서버별) 모델의 골격. 멱등.
--   다이아 지갑·게임 테이블 server_id 스코핑은 후속 단계(SERVER.md §5 P2~)에서 이관.

create table if not exists servers (
  id smallint primary key,
  name text not null,
  -- open(정상) | full(신규 캐릭터 생성 제한) | closed(준비/통합 대비)
  status text not null default 'open',
  opened_at timestamptz not null default now()
);

insert into servers (id, name) values (1, '1서버')
on conflict (id) do nothing;

-- 캐릭터 = 서버별 진행 단위. 서버별 스칼라(지갑·거주지·튜토리얼)는 P2~에서 컬럼 추가·이관.
create table if not exists characters (
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null references servers(id),
  created_at timestamptz not null default now(),
  primary key (user_id, server_id)
);
create index if not exists characters_server_idx on characters(server_id);

-- 백필: 기존 전 유저 = 1서버 캐릭터(현 게임 데이터의 소속 명시).
insert into characters (user_id, server_id, created_at)
select id, 1, created_at from profiles
on conflict do nothing;
