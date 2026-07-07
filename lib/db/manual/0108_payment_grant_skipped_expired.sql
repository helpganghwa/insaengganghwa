-- 0108: 결제 지급-스킵 마커 + pending 만료 상태 (2026-07-07 전수감사 A-묶음)
--
-- ① grant_skipped — 지급 없이 paid로 전이된 주문 마커(인생 특가 중복 결제 차단분,
--    미성년 월 한도 초과 보류분). 환불 시 이 주문은 재화 회수를 건너뛴다 — 회수 로직이
--    "다른 주문이 지급한" 재화를 몰수하는 사고 방지(refund.ts 참조).
alter table iap_orders add column if not exists grant_skipped boolean not null default false;

-- ② iap_status 'expired' — 결제창만 열고 이탈한 pending을 24시간 후 종결(payment-recon).
--    pending이 영구 누적되면 recon 스캔(limit 50)이 죽은 주문으로 차 진짜 유실 주문이
--    영원히 미치유되고, 대시보드 인바리언트에도 노이즈가 쌓인다.
--    늦은 결제(만료 후 웹훅)는 completePurchase가 expired→paid 전이를 허용해 흡수.
alter type iap_status add value if not exists 'expired';
