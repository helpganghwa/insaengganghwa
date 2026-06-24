-- ───────────────────────────────────────────────────────────────────────────
-- 0079 신고 중복 단위 변경 — (프로필, 신고자) → (프로필, 신고자, 사유).
--
-- 같은 신고자라도 사유가 다르면 재신고 허용(닉네임 신고 후 아바타도 신고 등).
-- 기존 데이터는 신고자당 프로필 1건뿐이라 새 유니크와 충돌 없음. 멱등.
-- ───────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS profile_reports_profile_reporter_uq;
CREATE UNIQUE INDEX IF NOT EXISTS profile_reports_profile_reporter_reason_uq
  ON profile_reports (profile_id, reporter_user_id, reason);
