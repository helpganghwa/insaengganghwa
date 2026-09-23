-- 0215 — Play 주문 "마지막 결제 시도 시각"(2026-09-24, docs/PLAYSTORE.md RTDN).
-- createPlayOrder가 주문을 새로 만들거나 재사용할 때마다 now()로 찍는다. RTDN(구글 실시간 알림)이 구매를
-- 우리 주문과 맞출 때 이 값 기준 [구매 시각 -15분, +2분] 창을 쓴다 — 재사용 주문은 created_at이 최대 6시간 전이라
-- created_at으로는 구매자 본인 주문이 창 밖으로 빠지거나 남의 방치 주문이 끼어들었다(감사 A1).
-- 추가 전용·기본값 없음(기존 행 null) — 코드 배포 **전에** 적용한다(코드가 이 컬럼을 쓰고 읽는다).
alter table iap_orders add column if not exists play_checkout_at timestamptz;
create index if not exists iap_orders_play_checkout_idx
  on iap_orders (play_sku, play_checkout_at)
  where provider = 'play' and play_purchase_token is null;
