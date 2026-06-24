-- ───────────────────────────────────────────────────────────────────────────
-- 0074 점검 킬스위치 — system_mode.scheduled_until + 기본 행 보장.
--
-- 점검을 시간지정(scheduled_until) 또는 무기한(null)으로 운영. global 행이 없으면
-- 토글 대상이 없으므로 기본 live 행을 보장(멱등).
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE system_mode ADD COLUMN IF NOT EXISTS scheduled_from timestamptz;
ALTER TABLE system_mode ADD COLUMN IF NOT EXISTS scheduled_until timestamptz;

INSERT INTO system_mode (key, mode) VALUES ('global', 'live')
  ON CONFLICT (key) DO NOTHING;
