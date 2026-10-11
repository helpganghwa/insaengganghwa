-- 0239 원정대 대원 내보내기(docs/WORLD-BOSS.md §2, 10-11 사용자 결정 ⑨): 신청 행 상태에 'kicked' 추가.
-- 내보내진 사람은 같은 원정대에 다시 신청할 수 없다(requestJoin이 KICKED). 대장이 다시 초대해 수락하면 행이 지워져 풀린다.
-- 멱등(drop if exists → add). lock_timeout 3s — 못 잡으면 실패하니 한산한 시간에 다시 실행.
begin;
set local lock_timeout = '3s';
alter table world_boss_join_requests drop constraint if exists world_boss_join_requests_status_check;
alter table world_boss_join_requests add constraint world_boss_join_requests_status_check check (status in ('pending', 'accepted', 'rejected', 'kicked'));
commit;
