-- 점령전 지연 공개(reveal) — GUILD §5.8.
-- 23:00 정산은 결과를 conquest_battles에 저장(published_at=NULL)하되 소유권/우편은 미적용.
-- 24:00 공개 시 소유권 적용·우편 발송 후 published_at=now()로 마킹.
-- 유저 노출(전투 기록 조회)은 published_at IS NOT NULL 행만. 추가형 nullable이라 구버전 안전.
ALTER TABLE conquest_battles ADD COLUMN IF NOT EXISTS published_at timestamptz;
