-- 강화 완료 푸시 기본 모드 instant → batched(30분 그룹화)로 변경(2026-07-03 사용자 결정).
-- 알림 피로 감소 목적. 기존 유저의 선택값은 유지(신규 row만 적용).
ALTER TABLE profiles ALTER COLUMN push_enhance_mode SET DEFAULT 'batched';
