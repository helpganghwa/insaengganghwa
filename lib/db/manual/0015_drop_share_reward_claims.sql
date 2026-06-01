-- share_reward_claims 테이블 제거(2026-06-01 사용자 결정).
-- 공유 일일 보상(1일 1회 100다이아)은 지급 로직이 구현된 적 없어 항상 빈 테이블이었음 —
-- 기능 미도입 확정에 따라 스키마에서 제거. 데이터 없음(멱등·안전).
DROP TABLE IF EXISTS public.share_reward_claims;
