-- 길드 문양 최초 생성 내구 재시도(2026-07-04).
-- 배경: 결성 시 문양 생성이 after() best-effort 1회뿐이라 pixflux 장애(SECOND 길드,
-- 25s 타임아웃×4키교대) 시 영구 무문양. 선택값을 저장해 cron이 완성까지 재시도한다.
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS emblem_selection jsonb;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS emblem_attempts int NOT NULL DEFAULT 0;
