-- 0168: raid_boss enum에 왕국 보스 '그리핀' 추가(2026-08-21)
--
-- 6개 지역 중 왕국만 보스가 없어 지역 칭호(raid_kingdom)와 대륙 토벌(continent_sweep)이
-- 성립 불가였다. 난이도·보상은 기존 5종과 동일 규칙(GDD §3.5 — 스토리/이미지만 차이).
-- 보스 정의·스프라이트는 backup/avatar-attr-2026-07-28에 준비돼 있던 gold_griffin을 이관.
alter type raid_boss add value if not exists 'gold_griffin';
