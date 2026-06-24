-- ───────────────────────────────────────────────────────────────────────────
-- 0078 계정 정지 — profiles.banned_at / ban_reason / ban_until.
--
-- 신고 처리(버그악용·기타 등)로 운영자가 계정 정지. 게임 접근 차단 + 로그인 시 사유 노출.
-- ban_until null=영구, 지나면 자동 해제 간주. 멱등.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at  timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_until  timestamptz;
