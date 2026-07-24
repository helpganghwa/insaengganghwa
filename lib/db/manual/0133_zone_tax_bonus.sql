-- 0133 독점 세금 보너스(B안) — 구역별 세금 배율 저장 컬럼. 소유 변동 시 recalcTaxBonus로 갱신,
-- 강화 세금 누적은 이 값만 읽어 곱(고빈도 경로 부하 최소). 중립 구역 = 1.
alter table zones add column tax_bonus real not null default 1;
