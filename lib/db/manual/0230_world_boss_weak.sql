-- 0230: 월드보스 페이즈 약점(2026-10-09, docs/WORLD-BOSS.md §3 원정대원 전투력).
--  - world_bosses.weak: 소환 때 고정하는 페이즈별 약점 장비. 배열 원소 하나 = 페이즈 하나
--    {"weapon": [code…], "armor": [code…], "accessory": [code…]}(부위별 10개). 빈 배열이면 첫 출발 때 채운다.
--  - world_boss_weak_reveals: 맞혀서 공개된 약점과 처음 맞힌 대원(발견자 — 이름만 남기고 보상은 없다).
-- 신설 칸·표뿐이라 코드보다 먼저 적용해도 무해. ⚠ 0228 뒤, 코드보다 **반드시 먼저** 적용할 것.
begin;
set local lock_timeout = '3s';

alter table world_bosses add column if not exists weak jsonb not null default '[]'::jsonb;

create table if not exists world_boss_weak_reveals (
  boss_id bigint not null references world_bosses(id) on delete cascade,
  phase smallint not null check (phase >= 0),
  code text not null,
  slot text not null check (slot in ('weapon', 'armor', 'accessory')),
  finder_user_id uuid references profiles(id) on delete set null,
  finder_nickname text not null,
  party_id bigint references world_boss_parties(id) on delete set null,
  revealed_at timestamptz not null default now(),
  primary key (boss_id, phase, code)
);
alter table world_boss_weak_reveals enable row level security;

commit;
