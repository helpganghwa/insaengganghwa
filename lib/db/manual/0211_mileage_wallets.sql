-- 0211 (2026-09-21) 마일리지를 서버 단위로 — 2서버 남은 결정 D4.
--
-- 종전: profiles.mileage(계정 단위), 원장의 마일리지 행은 server_id = null.
-- 이제: 결제한 서버에 쌓이고 그 서버에서만 쓴다(다이아 지갑·결제 귀속과 같은 기준). 교환 기능을
--       만들기 전이라 지금이 가장 싸다 — 교환이 열린 뒤에는 1서버 결제로 쌓은 점수를 2서버 재화로
--       바꾸는 통로가 되어 "서버 간 이전 불가" 원칙에 구멍이 난다.
--
-- characters에 넣지 않고 **전용 테이블**로 둔다. 결제·환불 트랜잭션의 잠금 순서가
--   iap_orders → monthly_purchase_limits → (마일리지) → battlepass → characters
-- 인데, 마일리지를 characters 행에 두면 환불이 characters를 battlepass보다 먼저 잠가
-- 배틀패스 수령(battlepass → characters)과 교착(ABBA)이 생긴다.
--
-- ⚠ **코드보다 먼저** 적용하고, **코드 배포 직후 한 번 더** 적용한다(전체가 멱등).
--   적용~배포 사이에 구코드가 적립한 건은 원장에 server_id = null로 남고 새 지갑에는 빠져 있다 —
--   두 번째 실행이 그 행들의 서버를 채우고 잔액을 원장에서 다시 계산해 짝을 맞춘다.
--   (원장이 정본, 지갑은 캐시. 2026-09-21 실서버: 원장 합계 = 잔액 합계 291,280점 · 65명 전원 일치)
create table if not exists mileage_wallets (
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null,
  balance bigint not null default 0,
  primary key (user_id, server_id)
);
-- RLS deny-all 백스톱(0113 규칙: 새 표는 만들 때 함께 켠다). 공개 역할(anon·authenticated)에는 애초에 grant가
-- 없어 지금도 노출은 없지만, 누군가 실수로 grant를 주는 순간을 막는 두 번째 그물이다. 앱의 접속 역할
-- (postgres — 소유자·bypassrls)은 영향이 없다. 멱등.
alter table mileage_wallets enable row level security;

-- 원장에 서버 채우기 — 적립·회수 행은 주문의 서버를 따른다.
update point_ledger pl
   set server_id = o.server_id
  from iap_orders o
 where pl.kind = 'mileage' and pl.server_id is null
   and pl.ref ~ '^order:[0-9]+'
   and o.id = split_part(pl.ref, ':', 2)::bigint;
-- 주문과 붙지 않는 행(탈퇴 소멸 등) — 그 시절에는 1서버뿐이었다.
update point_ledger set server_id = 1 where kind = 'mileage' and server_id is null;

-- 잔액 = 원장 합계(멱등 — 몇 번을 돌려도 같은 값).
insert into mileage_wallets (user_id, server_id, balance)
select user_id, server_id, greatest(0, sum(delta))
  from point_ledger
 where kind = 'mileage'
 group by user_id, server_id
on conflict (user_id, server_id) do update set balance = excluded.balance;
