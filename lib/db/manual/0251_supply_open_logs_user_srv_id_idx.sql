-- 0251 (2026-11-06 업데이트 18) — 칭호 판정의 보급 지표용 커버링 인덱스.
-- 판정(lib/game/titles/judge.ts)의 보급 쿼리 4종은 모두 `user_id = 나 and server_id = 서버`로 그 유저의 보급 기록 전체를 읽는다:
--   · 보급 횟수·하루 최대·아침·심야(created_at) · 3연속/5연속 같은 장비·세 끼(`lag(...) over (order by id)`, catalog_item_id·slot·created_at)
--   · 풀코스(보급한 날짜 목록) · 가입 100일째 활동(그날 보급 여부)
-- 지금 인덱스는 (user_id, created_at desc)뿐이라 server_id·catalog_item_id·slot은 힙에서 읽고, id 순서 창 함수는 따로 정렬했다.
-- (user_id, server_id, id) 순서에 나머지를 INCLUDE로 두면 네 쿼리가 index-only로 끝나고 창 함수가 정렬 없이 인덱스 순서를 쓴다.
-- supply_open_logs는 append-only라 가시성 맵이 잘 서서 index-only 효과가 크다. 도전과제(challenges/status.ts)의 슬롯별 exists도 탄다.
-- supply_open_logs_user_created_idx는 그대로 둔다 — 오늘 보급 수(today/stats.ts, created_at 범위)와 탈퇴 삭제가 쓴다.
--
-- 프로덕션에는 따로 적용한다. CONCURRENTLY는 트랜잭션 안에서 못 돌린다 — apply-migration.ts(트랜잭션) 대신 단독 실행할 것(0224·0241·0242와 같다).
--   예: psql "$PROD_DATABASE_URL" -f lib/db/manual/0251_supply_open_logs_user_srv_id_idx.sql
create index concurrently if not exists supply_open_logs_user_srv_id_idx
  on public.supply_open_logs (user_id, server_id, id) include (created_at, catalog_item_id, slot);
