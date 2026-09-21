-- 0206 (2026-09-21) 알림 묶음 키에 서버 추가 — **1단계(코드 배포 전)**. 2서버 전수조사 ⑰.
--
-- push_pending의 PK가 (user_id, category)라 한 사람당 카테고리마다 한 행뿐이었다. 묶음 윈도
-- (30/60분) 중에 서버를 옮기면 두 서버 항목이 같은 행에 섞이고 server_id가 마지막 값으로 덮였다.
-- 중복 제거 키가 (slot, slot_lane)뿐이라 같은 슬롯이면 앞 서버 항목이 조용히 지워져, "강화 3건
-- 준비 완료"를 눌러도 실제로는 1건뿐인 일이 생긴다(SERVER.md 경계규칙1 위반).
--
-- ⚠ **두 단계로 나눈다**(무중단). 적재(appendEnhanceReady)는 잡을 '보냄'으로 마킹한 **뒤에** 돌고
--   실패해도 재시도하지 않는다 — PK를 한 번에 바꾸면 적용과 배포 사이 몇 분 동안 묶음 알림이
--   통째로 유실된다(구코드의 on conflict (user_id, category)가 arbiter를 못 찾아 실패).
--   1단계(이 파일)  : 새 유니크 (user_id, category, server_id)를 **더하기만** 한다. 옛 PK는 그대로라
--                     구코드·신코드가 모두 동작한다(신코드는 새 유니크를 arbiter로 쓴다).
--   2단계(0209)     : 신코드가 올라간 뒤 옛 PK를 내리고 새 유니크를 PK로 승격한다.
--   서버가 하나인 동안은 1단계 상태로도 충돌이 없다(옛 PK에 걸리는 건 같은 사람의 두 서버 행뿐).
--
-- 잔여 null 서버는 1로 메운다(0154 이전 행 — 그때는 1서버뿐이었다).
update push_pending set server_id = 1 where server_id is null;
alter table push_pending alter column server_id set default 1;
alter table push_pending alter column server_id set not null;

create unique index if not exists push_pending_user_cat_server_uq
  on push_pending (user_id, category, server_id);
