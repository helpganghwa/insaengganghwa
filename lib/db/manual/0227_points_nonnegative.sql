-- 0227: 포인트 잔액 음수 금지(2026-10-06, docs/POINT-SHOP.md §2).
--  - characters.melee_points >= 0, mileage_wallets.balance >= 0.
--  - 코드는 조건부 차감(잔액 >= 금액)과 0 클램프로 음수를 만들지 않는다. 이 제약은 그 전제가 깨졌을 때
--    (새 코드의 실수·수동 SQL·소급 스크립트) 조용히 음수가 되는 대신 그 문장을 실패시키는 마지막 안전장치다.
--  - 적용 전 음수 행이 없어야 한다(있으면 이 파일 전체가 실패한다 — 그 행부터 조사).
--    확인: select (select count(*) from characters where melee_points < 0), (select count(*) from mileage_wallets where balance < 0);
--  - 코드와 순서 무관(코드가 음수를 만들지 않으므로 먼저·나중 어느 쪽이든 무해). 여러 번 실행해도 같다.
begin;
-- 잠금을 오래 기다리지 않는다(못 잡으면 실패 — 다시 실행). set local = 이 트랜잭션에만.
set local lock_timeout = '3s';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'characters_melee_points_nonneg') then
    alter table characters add constraint characters_melee_points_nonneg check (melee_points >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mileage_wallets_balance_nonneg') then
    alter table mileage_wallets add constraint mileage_wallets_balance_nonneg check (balance >= 0);
  end if;
end $$;

commit;
