-- 0254 (2026-11-26) 채팅 답장 — 전체·길드 채팅에서 특정 메시지에 답한다(귓속말은 대상 아님).
--  - reply_to_id: 답한 원래 메시지 id. FK를 두지 않는다 — 원문은 보존 정리(1,000개·7일)·탈퇴로
--    먼저 사라질 수 있고, 그때도 '답장이었다'는 사실은 남아 "볼 수 없는 메시지입니다"로 보여야 한다.
--  - 원문 조회는 PK라 인덱스 추가 없음.
-- ⚠ 코드보다 **먼저** 적용할 것 — 컬럼 추가뿐이라 먼저 적용해도 무해(새 코드는 이 컬럼을 읽는다).
begin;
set local lock_timeout = '3s';

alter table chat_messages add column if not exists reply_to_id bigint;

commit;
