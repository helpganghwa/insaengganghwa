-- 0107: 성능 인덱스 3종 (성능·확장성 감사 2026-07-07)
-- 유저 수 비례로 seq scan이 되는 크론·조회 경로 보강. 멱등.

-- 리더보드 스냅샷·대난투 로스터의 서버 단위 집계(group by user_id) — 기존 인덱스는
-- 전부 user_id 선행이라 server_id 필터 집계가 매번 seq scan이었다.
create index if not exists ue_server_user_idx
  on public.user_equipment (server_id, user_id);

-- payment-recon 10분 주기 스캔(부분) + 유저 구매내역 조회(user_id).
create index if not exists iap_orders_pending_created_idx
  on public.iap_orders (created_at) where status = 'pending';
create index if not exists iap_orders_paid_paidat_idx
  on public.iap_orders (paid_at) where status = 'paid';
create index if not exists iap_orders_user_idx
  on public.iap_orders (user_id);

-- mail-expire (b)절(수령완료 30일 경과) — created_at full scan 제거(부분 인덱스).
create index if not exists mailbox_claimed_created_idx
  on public.mailbox (created_at) where claimed_at is not null;
