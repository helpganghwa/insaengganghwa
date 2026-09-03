-- 0186: Google Play 결제(2026-09-03, docs/PLAYSTORE.md §3.2) — 플레이스토어 앱(TWA) 안의 유료 상품은
-- Play 결제로 판다. 주문 테이블을 결제 수단(provider)으로 나누고 Play 구매 토큰을 멱등 키로 잡는다.
--  - provider: 'portone'(웹, 기존) | 'play'(앱). portone_order_id는 Play 주문에서도 내부 주문번호('gp-<uuid>')로 쓴다.
--  - play_sku: 주문 시점에 정한 Play 인앱 상품 ID(가격 담당). 검증 시 이 SKU로 구글에 조회한다.
--  - play_purchase_token: 구글이 구매마다 주는 토큰 — 유일해야 한 구매로 두 주문을 지급하지 못한다.
--  - play_order_id: 구글 주문번호(GPA.xxxx) — 환불 API·voided 동기화·CS 대조용.
--  - play_consumed_at: 소모 처리(consume) 시각. 3일 내 미소모면 구글이 자동 환불하므로 cron이 재시도한다.
-- 구 코드와 호환: 전부 기본값/NULL 허용이라 배포 전 적용해도 무해.
begin;

alter table iap_orders add column if not exists provider text not null default 'portone';
alter table iap_orders add column if not exists play_sku text;
alter table iap_orders add column if not exists play_purchase_token text;
alter table iap_orders add column if not exists play_order_id text;
alter table iap_orders add column if not exists play_consumed_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'iap_orders_provider_chk') then
    alter table iap_orders add constraint iap_orders_provider_chk check (provider in ('portone', 'play'));
  end if;
end $$;

create unique index if not exists iap_orders_play_token_uq on iap_orders (play_purchase_token) where play_purchase_token is not null;
-- play-sync cron: 미소모 paid 주문 재시도 스캔.
create index if not exists iap_orders_play_unconsumed_idx on iap_orders (paid_at)
  where provider = 'play' and status = 'paid' and play_consumed_at is null;

commit;
