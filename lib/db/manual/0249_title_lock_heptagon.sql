-- 0249: 육관왕 → 칠관왕(랭킹 7종 — 칭호 랭킹 추가, 2026-11-06 업데이트 18, docs/TITLES.md).
--  pentagon 조건이 '랭킹 7종 모두 10위 이내'로 바뀌어, 6종 기준으로 얻은 기존 보유자를 다시 잠근다(0223과 같은 방식).
--  잠긴 칭호는 발견 상태는 유지하되 비활성(목록 '비활성', 대표로 달아도 표시 안 함). 7종 조건을 한 번 채우면
--  judge(discoverTitles)가 행을 지워 영구 활성으로 돌아간다.
-- ⚠ 코드 배포 **직후** 적용(먼저 적용하면 배포 전까지 6종 조건을 채운 사람도 잠긴 채로 보인다 — 무해하지만 혼란).
--   멱등(on conflict do nothing) — 다시 실행해도 같은 결과. 단, 배포 뒤 7종을 채워 풀린 사람을 다시 잠그지
--   않도록 **한 번만** 실행할 것(다시 돌리면 풀린 사람도 다시 잠기고, 다음 판정 때 다시 풀린다).
begin;
set local lock_timeout = '3s';

insert into title_legacy_locks (user_id, server_id, title_code)
select user_id, server_id, 'pentagon' from user_titles where title_code = 'pentagon'
on conflict do nothing;

commit;
