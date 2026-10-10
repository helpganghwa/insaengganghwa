-- 0233 월드보스 관리자 소환(docs/WORLD-BOSS.md §1, 2026-10-11)
-- 자동 하루 1마리 추첨을 없애고 관리자가 구역을 지정해 즉시·예약 소환한다.
--  · (server_id, kst_day) 유니크 해제 — 같은 날 두 마리(동시 출현)를 허용한다(관리자가 한 번 더 확인하고 진행).
--  · 구역당 출현 중/예정은 한 마리 — 소환 트랜잭션이 구역 행을 잠그고 검사한다(제약은 두지 않음: 정리·테스트 행과 충돌).
begin;
set local lock_timeout = '3s';

alter table world_bosses drop constraint if exists world_bosses_server_id_kst_day_key;
drop index if exists world_bosses_server_day_uq;
create index if not exists world_bosses_server_day_idx on world_bosses (server_id, kst_day);

commit;
