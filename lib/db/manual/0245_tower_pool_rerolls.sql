-- 0245 (2026-10-16) 무한의 탑 요구 장비 다시 뽑기(유저 건의 #go7OSj6U, docs/TOWER.md §2 · docs/POINT-SHOP.md §6).
--  - tower_pool_rerolls: (유저, 서버, 주 시작 월요일, 층) 그 유저에게만 적용되는 요구 장비 — 서버 공통 tower_pools 위에 덮어쓴다.
--    대난투 포인트 10 · 20 · 40(마일리지 ×10)으로 하루 3번, 모든 층(11층부터), 3부위 동시, 즉시 교체·되돌리기 없음(10-15 결정).
--    월요일 0시 서버 갱신 때 week_start가 달라져 자연히 무시된다(삭제 작업 없음, 지난 주 행은 남아도 해가 없다).
--  - point_extra_buys.item에 'tower_reroll' 허용(하루 횟수·가격 계단은 추가 횟수와 같은 표).
-- ⚠ 코드보다 **먼저** 적용할 것 — 표가 없으면 탑 화면 조회가 오류를 낸다. 신설·제약 완화뿐이라 먼저 적용해도 무해.
begin;
set local lock_timeout = '3s';

create table if not exists tower_pool_rerolls (
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null,
  week_start date not null,
  floor smallint not null,
  weapon text[] not null,
  armor text[] not null,
  accessory text[] not null,
  created_at timestamptz not null default now(),
  primary key (user_id, server_id, week_start, floor)
);
alter table tower_pool_rerolls enable row level security;

alter table point_extra_buys drop constraint if exists point_extra_buys_item_check;
alter table point_extra_buys add constraint point_extra_buys_item_check check (item in ('expedition', 'raid', 'tower', 'tower_reroll'));
commit;
