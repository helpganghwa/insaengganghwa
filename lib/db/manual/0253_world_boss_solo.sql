-- 0253 (2026-11-13) 개인 월드보스(그림자 거미 여왕, docs/WORLD-BOSS-SOLO.md) — 출현 구역 거주자가 혼자 도전(10타 1판)해 최고 기록으로 겨룬다.
--  - world_bosses.pool: 개인 보스의 부위별 요구 장비(탑 규칙, 소환 때 추첨). 원정대 보스는 null.
--  - world_boss_solo_runs: 도전 1판 = 1행(10타 패턴·피해 jsonb). 공동 페이즈엔 모든 판의 점수가 쌓인다.
--  - world_boss_solo_records: (보스, 유저) 최고 기록 — 순위표. 동점은 먼저 세운 사람(best_at). 정산 때 최종 순위·보상을 적는다.
--  - point_extra_buys.item에 'wb_retry'(재도전 10·20pt, 하루 2번) 허용.
-- ⚠ 코드보다 **먼저** 적용할 것 — 신설·컬럼 추가·제약 완화뿐이라 먼저 적용해도 무해.
begin;
set local lock_timeout = '3s';

alter table world_bosses add column if not exists pool jsonb;

create table if not exists world_boss_solo_runs (
  id bigserial primary key,
  boss_id bigint not null references world_bosses(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null,
  kst_date date not null,
  paid boolean not null default false,
  score bigint not null,
  hits jsonb not null,
  power jsonb not null,
  idem_key uuid not null,
  created_at timestamptz not null default now()
);
create unique index if not exists world_boss_solo_runs_idem_uq on world_boss_solo_runs (idem_key);
create index if not exists world_boss_solo_runs_boss_user_idx on world_boss_solo_runs (boss_id, user_id, kst_date);
alter table world_boss_solo_runs enable row level security;

create table if not exists world_boss_solo_records (
  boss_id bigint not null references world_bosses(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null,
  best bigint not null,
  best_at timestamptz not null,
  best_run_id bigint not null,
  runs integer not null default 0,
  final_rank integer,
  reward_diamond integer not null default 0,
  reward_boxes integer not null default 0,
  primary key (boss_id, user_id)
);
create index if not exists world_boss_solo_records_rank_idx on world_boss_solo_records (boss_id, best desc, best_at);
create index if not exists world_boss_solo_records_user_idx on world_boss_solo_records (user_id);
alter table world_boss_solo_records enable row level security;

alter table point_extra_buys drop constraint if exists point_extra_buys_item_check;
alter table point_extra_buys add constraint point_extra_buys_item_check check (item in ('expedition', 'raid', 'tower', 'tower_reroll', 'wb_retry'));
commit;
