-- 아바타 생성 내역 운영자 검수(분쟁 처리) 추적.
-- 운영자가 결과를 보고 내린 결정과 시점을 기록 → 날짜별 점검(미검수/검수완료 구분).
--   admin_decision: 'confirm'(AI 결정 인정·무조치) | 'grant'(보상 다이아 지급) | 'reject'(아바타 회수+환불)
--   admin_reviewed_at: 운영자 결정 시각(null = 미검수)
ALTER TABLE profile_generation_jobs
  ADD COLUMN IF NOT EXISTS admin_decision text,
  ADD COLUMN IF NOT EXISTS admin_reviewed_at timestamptz;
