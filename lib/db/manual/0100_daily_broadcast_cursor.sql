-- 일일 보급 푸시 브로드캐스트 재개 커서(2026-07-03).
-- 기존: 발송 시작 시 kst_day claim → 함수 타임아웃으로 중단되면 fallback cron이
-- already_sent로 skip → 잔여 유저 영구 미발송(청크 지연 15s × maxDuration 300s ≈ 4천명 한계).
-- 변경: cursor_user_id로 진행 지점을 기록하고 completed_at으로 완주를 판정 —
-- 중단 시 다음 cron(30분 주기)이 커서부터 이어서 발송한다.
ALTER TABLE daily_supply_broadcasts ADD COLUMN IF NOT EXISTS cursor_user_id text;
ALTER TABLE daily_supply_broadcasts ADD COLUMN IF NOT EXISTS completed_at timestamptz;
-- 기존 행은 전부 구방식 완주분 — 완료로 백필해 재발송을 막는다.
UPDATE daily_supply_broadcasts SET completed_at = sent_at WHERE completed_at IS NULL;
