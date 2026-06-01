-- mailbox.expires_at DEFAULT를 30일 → 7일로 변경(2026-06-01 사용자 결정).
-- 기존 row의 expires_at은 그대로 유지(보장된 만료일 깨지 않도록). 신규 row만 7일 적용.
ALTER TABLE mailbox ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');
