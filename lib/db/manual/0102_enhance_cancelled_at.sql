-- 강화 취소 감사 시각(2026-07-06).
-- 배경: 슬롯 전멸 사건(RYUUUUUU, 6레인 등록 3분 내 일괄 취소)에서 취소가 아무 흔적도
-- 남기지 않아(로그·시각 없음) 주체 추적 불가였다. 취소 시각을 기록한다.
ALTER TABLE enhancement_jobs ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
