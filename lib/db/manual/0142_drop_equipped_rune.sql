-- 속성 완전 흡수(2026-07-28 확정) — 대표 아바타(active_profile_id)의 속성이 그대로 전투에 적용된다.
-- 별도 지정·교체 쿨·💎 단축을 폐기했으므로 관련 컬럼 제거(0138에서 추가했던 것).
alter table characters drop column if exists equipped_rune_id;
alter table characters drop column if exists rune_changed_at;
