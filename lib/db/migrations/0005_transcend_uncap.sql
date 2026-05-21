-- 초월 무한 진행(사용자 결정 2026-05-21).
-- transcend_level 0..10 CHECK 제거. 디자인은 T10 이상 동일(시각 클램프).
-- 0 하한은 의미 있어 유지(애플리케이션이 음수 set 안 함).
alter table equipment_instances drop constraint if exists transcend_level_range;
alter table equipment_instances add constraint transcend_level_min check (transcend_level >= 0);
