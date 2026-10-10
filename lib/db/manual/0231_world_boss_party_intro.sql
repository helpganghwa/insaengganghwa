-- 0231: 월드보스 원정대 소개글(2026-10-10, docs/WORLD-BOSS.md §2) — 만들 때 적는 한 줄(선택, 40자). 모집 카드와 내 원정대 패널에 보인다.
-- 신설 칸뿐이라 코드보다 먼저 적용해도 무해. ⚠ 0228 뒤, 코드보다 **반드시 먼저** 적용할 것(없으면 원정대 만들기·상세 조회가 실패한다).
begin;
set local lock_timeout = '3s';

alter table world_boss_parties add column if not exists intro text;

commit;
