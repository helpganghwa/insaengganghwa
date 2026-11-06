-- 0250 (2026-11-06 업데이트 18) — 칭호 판정·대표 칭호 재검증의 레이드 조회용 (user_id, created_at) 인덱스.
-- 판정(lib/game/titles/judge.ts)의 레이드 집계·스트릭·교차 쿼리와 display.ts의 march_live 재검증은 모두
-- `ra.user_id = 나 and ra.created_at >= (지금 캐릭터 생성 시각)`으로 찾는다(10-12 탈퇴자 기록 차단). 그런데 생성 시각이
-- InitPlan(값 모름)이라 플래너가 0242의 raid_attacks_created_idx(created_at)를 고른 뒤 user_id를 Filter로 거른다 —
-- 오래된 유저는 판정 한 번에 표 거의 전체를 4~5번 훑었다(스테이징 실측 821행 얻으려 1.7만 행 제거).
-- user_id·created_at을 모두 Index Cond로, raid_id·damage는 INCLUDE로 두어 집계가 index-only로 끝나게 한다.
-- raid_attacks_user_idx(user_id)는 이 인덱스와 앞부분이 겹친다 — 플랜 확인 뒤 별도로 정리할 수 있다(이 파일은 지우지 않는다).
--
-- 프로덕션에는 따로 적용한다. CONCURRENTLY는 트랜잭션 안에서 못 돌린다 — apply-migration.ts(트랜잭션) 대신 단독 실행할 것(0224·0241·0242와 같다).
--   예: psql "$PROD_DATABASE_URL" -f lib/db/manual/0250_raid_attacks_user_created_idx.sql
create index concurrently if not exists raid_attacks_user_created_idx
  on public.raid_attacks (user_id, created_at) include (raid_id, damage);
