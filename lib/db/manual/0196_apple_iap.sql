-- 0196: Apple 인앱 결제(2026-09-07, docs/APPSTORE.md §3.3) — 앱스토어 앱(Capacitor) 안의 유료 상품은
-- StoreKit 2로 팔고 서버가 App Store Server API로 거래를 조회해 지급한다. 0186(Play)과 같은 구조.
--  - provider: 'apple' 추가. portone_order_id는 Apple 주문에서도 내부 주문번호('ap-<uuid>')로 쓰며,
--    그 UUID가 StoreKit appAccountToken이 되어 거래 ↔ 주문을 묶는다.
--  - apple_product_id: 주문 시점에 정한 App Store 상품 ID(가격 담당).
--  - apple_transaction_id: Apple 거래 ID — 유일해야 한 거래로 두 주문을 지급하지 못한다.
--  - apple_original_transaction_id: 원거래 ID(CS 대조·환불 조회용). apple_environment: Sandbox/Production.
-- 구 코드와 호환: 전부 NULL 허용이라 배포 전 적용해도 무해.
begin;

alter table iap_orders add column if not exists apple_product_id text;
alter table iap_orders add column if not exists apple_transaction_id text;
alter table iap_orders add column if not exists apple_original_transaction_id text;
alter table iap_orders add column if not exists apple_environment text;

alter table iap_orders drop constraint if exists iap_orders_provider_chk;
alter table iap_orders add constraint iap_orders_provider_chk check (provider in ('portone', 'play', 'apple'));

create unique index if not exists iap_orders_apple_txn_uq on iap_orders (apple_transaction_id) where apple_transaction_id is not null;
-- apple-sync cron: 최근 paid Apple 주문의 환불(revocation) 재조회 스캔.
create index if not exists iap_orders_apple_paid_idx on iap_orders (paid_at)
  where provider = 'apple' and status = 'paid';

commit;
