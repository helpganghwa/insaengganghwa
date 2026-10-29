-- 0248 (2026-10-29) 파견 추가 칸 번호 이동 — 해금 6칸(합산 강화 15,000) 추가에 앞서 추가 파견 칸을 11번부터로 옮긴다.
-- lib/game/balance.ts EXPEDITION_EXTRA_SLOT_BASE(10). 종전 추가 칸은 "해금 칸 바로 뒤(6부터)"라 해금 칸을 6으로 늘리면
-- 옛 추가 칸 행(slot 6~8, 진행 중·수령 완료 모두)이 정규 6칸으로 읽힌다 → 6~10번을 +5 하여 11~13번으로.
--
-- ⚠ 순서: 이 SQL을 **새 코드보다 먼저** 적용한다 — 구 코드는 slot > 5 를 전부 추가 칸으로 보므로 11~13도 그대로 추가 칸으로 동작한다.
-- 멱등: 11번 이상 행이 하나라도 있으면(= 이미 적용됨, 또는 새 코드가 추가 칸을 만들기 시작함) 아무것도 하지 않는다.
-- 새 코드가 만든 정규 6칸 행을 잘못 옮기지 않도록 "6~10 사이" 조건만으로는 재실행하지 않는다.
begin;

update expeditions
set slot = slot + 5
where slot between 6 and 10
  and not exists (select 1 from expeditions where slot > 10);

commit;
