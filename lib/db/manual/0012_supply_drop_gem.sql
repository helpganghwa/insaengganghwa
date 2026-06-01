-- 0012 보급 다이아 보너스 완전 폐기 — supply_open_logs.gem_drop 컬럼 제거.
-- 사용자 결정(2026-06-01): 확률형 보석 드롭 기획 자체 삭제. 코드에서 이미 항상
-- 0으로 박혀 있어 데이터 손실 없음.

ALTER TABLE supply_open_logs DROP COLUMN IF EXISTS gem_drop;
