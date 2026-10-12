-- 0241 (2026-10-12) — 2서버 조사에서 DB 시간을 가장 많이 쓰던 두 쿼리의 서버 분리 인덱스.
--  · 길드 해방 등수(lib/game/guild/queries.ts liberation rank): 자기상관 서브쿼리가 catalog_item_id+server_id로 비교하는데
--    기존 ue_catalog_rank_idx(0026)에 server_id가 없어 서버 조건이 붙은 지금은 못 탔다(호출당 0.24~1.3s, 2서버면 전체 장비 수에 비례).
--  · 어제 보급 1위(lib/game/titles/open-top.ts): (server_id, created_at) 범위 조회 — 기존 인덱스는 (user_id, created_at)뿐이라 전체 스캔.
-- CONCURRENTLY는 트랜잭션 안에서 못 돌린다 — apply-migration.ts 대신 단독 실행할 것(0224·0225와 같다).
--   예: psql "$PROD_DATABASE_URL" -f lib/db/manual/0241_server_scope_indexes.sql  (또는 세션 풀러 5432 주소로 postgres-js 단문 실행)
create index concurrently if not exists ue_server_catalog_rank_idx
  on public.user_equipment (server_id, catalog_item_id, max_enhance_level desc, max_enhance_reached_at, user_id)
  where max_enhance_level > 0;
create index concurrently if not exists supply_open_logs_server_created_idx
  on public.supply_open_logs (server_id, created_at);
