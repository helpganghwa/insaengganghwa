-- ───────────────────────────────────────────────────────────────────────────
-- 0073 핫패스 user_id 인덱스 — append-only 무한증가 테이블의 풀스캔 제거.
--
-- 홈 허브·이력·도감 패널이 user_id로 자주 조회하나 기존 인덱스는 (raid_id,user_id)
-- 등 선두 컬럼 불일치라 서빙 불가 → seq scan. 볼륨이 영구 증가하므로 출시 전 적용.
-- 멱등(IF NOT EXISTS) — 재적용 안전.
-- ───────────────────────────────────────────────────────────────────────────

-- 홈 허브 미수령 레이드 보상(매 로드). 미수령만 보는 부분 인덱스.
CREATE INDEX IF NOT EXISTS raid_reward_user_unclaimed_idx
  ON raid_rewards (user_id) WHERE claimed_at IS NULL;

-- 레이드 페이지·리더보드의 user 참가 조회.
CREATE INDEX IF NOT EXISTS raid_participant_user_idx
  ON raid_participants (user_id);

-- 강화 이력/도감 — 유저·부위별 최신순.
CREATE INDEX IF NOT EXISTS enh_logs_user_created_idx
  ON enhancement_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS enh_logs_equipment_created_idx
  ON enhancement_logs (user_equipment_id, created_at DESC);

-- 보급 개봉 이력/도감 신규 해금.
CREATE INDEX IF NOT EXISTS supply_open_logs_user_created_idx
  ON supply_open_logs (user_id, created_at DESC);

-- 초월 이력 — 부위별 최신순.
CREATE INDEX IF NOT EXISTS transcend_logs_equipment_created_idx
  ON transcend_logs (user_equipment_id, created_at DESC);
