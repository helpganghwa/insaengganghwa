-- 0224 (2026-10-05) — enhancement_jobs.user_equipment_id 전체 인덱스.
-- user_equipment 삭제 시 FK(ON DELETE CASCADE)가 enhancement_jobs를 user_equipment_id로 찾는데, 이 컬럼엔 진행 중 작업용
-- 부분 인덱스(ej_equipment_running_uq, status='running')만 있어 장비 한 행마다 349만 행(908MB)을 순차 탐색했다.
-- 장비 125개인 유저의 탈퇴가 30초 문 상한(탈퇴 트랜잭션 SET LOCAL statement_timeout)에 걸려 계속 실패했다(메룽치킨 10-04~05).
-- CONCURRENTLY는 트랜잭션 안에서 못 돌린다 — apply-migration.ts(트랜잭션) 대신 단독 실행할 것.
create index concurrently if not exists ej_user_equipment_idx on enhancement_jobs (user_equipment_id);
