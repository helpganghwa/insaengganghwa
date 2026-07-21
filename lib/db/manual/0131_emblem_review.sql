-- 0131 (2026-07-21): 길드 문양 검수 상태 — 아바타 검수(profile-gen)와 동일 축의 결정 기록.
--  admin_decision: 'confirm'(검토 통과·무조치) | 'reject'(리젝+환불). null=미검수.
--  removed_at: 리젝 시 소프트 삭제(이력 보존 — 유저 문양 목록·개수 집계에서 제외).
-- 컬럼 추가만(안전) — 프로덕션·스테이징 즉시 적용 가능(구코드는 새 컬럼 무시).
ALTER TABLE guild_emblems
  ADD COLUMN IF NOT EXISTS admin_decision text,
  ADD COLUMN IF NOT EXISTS admin_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;
