-- 0164: raid_attacks(raid_id, id) 인덱스(2026-08-21, 칭호 적대 검수 2)
--
-- 배경: 선봉장(vanguard) 판정이 레이드별 최초 공격자를 LATERAL
-- (where a.raid_id = r.id order by a.id limit 1)로 뽑는데 raid_id 인덱스가 없어
-- 레이드 1건당 테이블 스캔이다. 레이드·공격이 쌓일수록 초선형으로 악화되어 칭호 화면
-- 판정 배치 전체를 끌어내린다. (raid_id, id) 복합이면 limit 1이 인덱스 첫 행으로 끝난다.
--
-- ⚠ CONCURRENTLY — 트랜잭션 밖에서 실행할 것.
create index concurrently if not exists raid_attacks_raid_id_idx
  on raid_attacks (raid_id, id);
