-- 0242 (2026-10-12) — 어제 레이드 피해 1위(칭호 raid_hero, lib/game/titles/open-top.ts yesterdayRaidTop)의 created_at 범위 조회.
-- 기존 인덱스는 (raid_id)뿐이라 날짜 함수 조건으로 raid_attacks 전체(20만 행, 비용 7,387)를 훑었다(2차 검사 L3).
-- CONCURRENTLY는 트랜잭션 안에서 못 돌린다 — apply-migration.ts 대신 단독 실행(0241과 같다).
create index concurrently if not exists raid_attacks_created_idx on public.raid_attacks (created_at);
