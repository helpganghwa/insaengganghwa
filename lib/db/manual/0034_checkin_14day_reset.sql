-- 0034 출석 14일 로테이션 전환 — 기존 진행도(0~27) 전체 리셋. 멱등. 실행: bun run scripts/_apply-0034.ts
-- CHECKIN_CYCLE_DAYS 28→14로 변경되어 day_progress 범위(0~13)를 벗어나므로 전체 0으로 초기화.
-- last_claimed_kst_day는 유지(오늘 중복 수령 방지).
UPDATE user_checkin_state SET day_progress = 0 WHERE day_progress <> 0;
