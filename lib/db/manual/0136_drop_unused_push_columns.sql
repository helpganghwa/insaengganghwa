-- 0136_drop_unused_push_columns.sql
-- push_supply·push_melee 제거 — 두 컬럼 모두 유저가 끌 수 없어 항상 true였다
-- (설정 UI·setPushCategoryAction·send.ts TOGGLE_COLUMN 어디에도 미노출, supply/melee는 상시발송).
-- push-daily-supply 크론의 무의미하던 `push_supply = true` 필터는 코드에서 선(先)제거함.
-- ⚠ 반드시 스키마에서 두 컬럼을 뺀 코드가 '배포된 후'에 적용할 것 — 배포 전 적용 시 구 코드의
--    profiles SELECT(drizzle 명시 컬럼)가 존재하지 않는 컬럼을 조회해 깨진다.
alter table profiles drop column if exists push_supply;
alter table profiles drop column if exists push_melee;
