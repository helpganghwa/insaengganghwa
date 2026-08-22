-- 0170: 결제·본인인증 결과 안내 확인(ack) 서버 기록(2026-08-22)
--
-- 복귀 결과 팝업의 중복 억제가 localStorage(브라우저별)라 PWA·모바일웹·PC 컨텍스트마다
-- 한 번씩 다시 떴다(사용자 제보). 계정 단위로 정확히 1회만 안내하도록 서버에 확인 시각 기록.
alter table iap_orders
  add column if not exists client_notified_at timestamptz;
alter table profiles
  add column if not exists identity_notified_at timestamptz;
