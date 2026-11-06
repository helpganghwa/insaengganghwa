-- 0252b (2026-11-06 업데이트 18) — 옛 전체 인덱스 ej_status_complete_idx(status, complete_at) 삭제.
-- ⚠ 0252a의 ej_running_complete_idx가 **indisvalid = true**이고, 같은 쿼리의 EXPLAIN이 새 인덱스를 타는 것을 확인한 뒤에만 실행한다.
--   select c.relname, i.indisvalid from pg_index i join pg_class c on c.oid = i.indexrelid where c.relname = 'ej_running_complete_idx';
--   explain select count(*) from enhancement_jobs where status = 'running';
--   (관리자 대시보드·푸시 크론 쿼리가 Seq Scan으로 바뀌지 않아야 한다.) 확인 전이면 실행하지 말 것 — 옛 인덱스는 두어도 해가 없다.
--
-- 적용 — CONCURRENTLY는 트랜잭션 안에서 못 돌린다. 트랜잭션 풀러가 아닌 연결(세션 풀러 5432 또는 직결)로 단독 실행:
--   psql -v ON_ERROR_STOP=1 "<세션 풀러/직결 연결 문자열>" -f lib/db/manual/0252b_ej_status_complete_idx_drop.sql
drop index concurrently if exists public.ej_status_complete_idx;
