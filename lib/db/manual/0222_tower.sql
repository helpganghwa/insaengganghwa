-- 0222: 무한의 탑(2026-09-28, docs/TOWER.md).
--  - tower_progress: (유저, 서버) 최고 도달 층·도달 시각(순위 동률 = 먼저 도달), 오늘(KST) 진 횟수, 마지막 고른 아바타.
--  - tower_battles: 도전 한 번 = 한 행. 결과·턴 기록을 서버가 만들어 박제 — 전투 화면·다시 보기의 원본.
--  - tower_pools: (서버, 주 시작 월요일, 구간) 부위별 요구 장비. 그 주 첫 접근 때 서버 RNG로 추첨해 박제(재추첨 없음).
--  - tower_specials: (서버, 구간) 특별층 지정 장비 3개. 한 번 정하면 고정.
-- 신설 표라 코드보다 먼저 적용해도 무해.
begin;

create table if not exists tower_progress (
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null,
  best_floor int not null default 0,
  best_at timestamptz,
  loss_day date,
  losses smallint not null default 0,
  last_profile_id uuid,
  updated_at timestamptz not null default now(),
  primary key (user_id, server_id)
);
create index if not exists tower_progress_rank_idx on tower_progress (server_id, best_floor desc, best_at asc);
alter table tower_progress enable row level security;

create table if not exists tower_battles (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null,
  floor int not null,
  win boolean not null,
  tower_cp int not null,
  requirement int not null,
  profile_id uuid,
  -- 장착 3개 [{slot,key,cp,mult,score}] · 턴 기록 [{turn,actor,damage,event,meHp,monHp}]
  pieces jsonb not null,
  turns jsonb not null,
  key_turn smallint not null,
  reward jsonb,
  created_at timestamptz not null default now()
);
create index if not exists tower_battles_user_idx on tower_battles (user_id, server_id, created_at desc);
alter table tower_battles enable row level security;

create table if not exists tower_pools (
  server_id smallint not null,
  week_start date not null,
  section smallint not null,
  weapon text[] not null,
  armor text[] not null,
  accessory text[] not null,
  created_at timestamptz not null default now(),
  primary key (server_id, week_start, section)
);
alter table tower_pools enable row level security;

create table if not exists tower_specials (
  server_id smallint not null,
  section smallint not null,
  weapon text not null,
  armor text not null,
  accessory text not null,
  created_at timestamptz not null default now(),
  primary key (server_id, section)
);
alter table tower_specials enable row level security;

commit;
