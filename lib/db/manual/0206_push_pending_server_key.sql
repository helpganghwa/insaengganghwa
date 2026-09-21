-- 0206 (2026-09-21) 알림 묶음 키에 서버 추가 — 2서버 전수조사 ⑰.
--
-- push_pending의 PK가 (user_id, category)라 한 사람당 카테고리마다 한 행뿐이었다. 묶음 윈도
-- (30/60분) 중에 서버를 옮기면 두 서버 항목이 같은 행에 섞이고 server_id가 마지막 값으로 덮였다.
-- 중복 제거 키가 (slot, slot_lane)뿐이라 같은 슬롯이면 앞 서버 항목이 조용히 지워져, "강화 3건
-- 준비 완료"를 눌러도 실제로는 1건뿐인 일이 생긴다(SERVER.md 경계규칙1 위반).
--
-- ⚠ **코드보다 먼저 적용한다** — 새 코드의 `on conflict (user_id, category, server_id)`는 이
--   유니크 제약이 있어야 동작한다. 반대로 이 SQL만 먼저 적용된 상태는 구코드에서도 안전하다
--   (구코드의 on conflict (user_id, category)는 PK가 아니어도 되는 게 아니라 깨지므로,
--    적용과 배포 사이를 짧게 둔다 — 묶음 알림 적재만 잠시 실패하고 강화 결과는 정상).
--
-- 잔여 null 서버는 1로 메운다(0154 이전 행 — 그때는 1서버뿐이었다).
update push_pending set server_id = 1 where server_id is null;
alter table push_pending alter column server_id set default 1;
alter table push_pending alter column server_id set not null;

alter table push_pending drop constraint push_pending_pkey;
alter table push_pending add constraint push_pending_pkey primary key (user_id, category, server_id);
