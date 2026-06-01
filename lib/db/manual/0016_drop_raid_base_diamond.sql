-- raid_rewards.base_diamond 컬럼 제거(2026-06-01 사용자 결정).
-- 레이드 기본 참가 보상(100다이아)을 폐지 — 보상은 페이즈 돌파 추첨(phase_diamond)만.
-- 기존 행의 base_diamond는 이미 수령(claim) 시 잔액에 반영됐으므로 컬럼만 제거(멱등·안전).
ALTER TABLE raid_rewards DROP COLUMN IF EXISTS base_diamond;
