-- 0008 강화 푸시 묶음 1시간 옵션 추가 (1회 적용)
-- pgEnum에 'batched_1h' 추가. CASCADE 영향 없음(추가만).
-- ADD VALUE는 트랜잭션 외부에서 실행되어야 하므로 단일 statement.
alter type push_enhance_mode add value if not exists 'batched_1h';
