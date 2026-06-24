-- ───────────────────────────────────────────────────────────────────────────
-- 0075 회원탈퇴 — profiles.withdrawn_at.
--
-- 게임데이터 파기 후 탈퇴 마킹(결제기록은 profiles 유지로 보존). 재로그인 시 createCharacter가 해제.
-- 멱등.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;
