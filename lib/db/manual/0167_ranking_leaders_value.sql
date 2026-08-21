-- 0167: ranking_leaders에 1위 값 저장(2026-08-21)
--
-- 칭호 '신기록'(new_record)의 판정 기준을 "1위 유저 교체"에서 "최고 기록 값 경신"으로 교정.
-- 유저 교체만 보면 (a) 1위 탈퇴 승계(더 낮은 값)와 (b) 동률 추월(uuid 타이브레이크)에
-- 오지급되고, (c) 1위가 자기 기록을 올리는 정당한 경신은 영영 못 받는다.
-- 값이 null인 행(이 컬럼 도입 전 시드)은 다음 크론이 값만 기록하고 지급하지 않는다.
alter table ranking_leaders
  add column if not exists value bigint;
