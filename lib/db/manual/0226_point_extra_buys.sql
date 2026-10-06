-- 0226: 포인트 상점 추가 횟수(2026-10-06, docs/POINT-SHOP.md §6).
--  - point_extra_buys: (유저, 서버, KST 날짜, 상품, 파견 칸) 그날 산 횟수. 다음 구매 가격 = 오늘 산 횟수로 정한다.
--    상품 = expedition(파견 다시 보내기 — 칸마다 따로 센다) · raid(오늘 레이드 +1회) · tower(탑 추가 도전). 파견이 아니면 slot = 0.
--  - 각 콘텐츠의 하루 한도는 이 표의 오늘 행을 더해 판정한다(레이드 하루·동시 한도, 탑 남은 도전, 파견 칸별 출발 횟수).
-- 신설 표·기존 칸 보장뿐이라 코드보다 먼저 적용해도 무해. ⚠ 코드보다 **반드시 먼저** 적용할 것 — 표가 없으면
-- 홈·파견·탑·레이드·탈퇴가 오류를 낸다.
begin;
-- characters·profiles 잠금을 오래 기다리지 않는다(긴 트랜잭션 뒤에 줄 서면 뒤따르는 조회가 전부 밀린다).
-- 못 잡으면 이 파일 전체가 실패할 뿐이라 다시 실행하면 된다. set local = 이 트랜잭션에만(풀러에 새지 않는다).
set local lock_timeout = '3s';

create table if not exists point_extra_buys (
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null,
  kst_date date not null,
  item text not null check (item in ('expedition', 'raid', 'tower')),
  slot smallint not null default 0,
  count smallint not null default 0,
  primary key (user_id, server_id, kst_date, item, slot)
);
alter table point_extra_buys enable row level security;

-- 아바타 보관함 늘린 칸(10-06) — 0124(07-20, 되돌린 기능)가 만든 칸을 다시 쓴다. 0124 파일이 저장소에 없어
-- 새 DB에서는 이 줄이 칸을 만든다(이미 있으면 아무것도 안 함). 한도 = 100 + 이 값, 최대 200.
alter table characters add column if not exists avatar_slot_bonus integer not null default 0;

commit;
