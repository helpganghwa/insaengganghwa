-- mailbox.expires_at DEFAULT를 7일 → 30일로 상향(2026-07-03 사용자 결정).
-- CBT 보상·사과 보상 우편이 7일 미접속 유저에게서 증발하는 문제 대응.
-- 기존 row의 expires_at은 그대로 유지(이미 안내된 만료일 보존). 신규 row만 30일 적용.
ALTER TABLE mailbox ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 days');
