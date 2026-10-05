-- 0225 (2026-10-05) — 지울 때 연쇄로 찾는 연결(FK) 중 전체 인덱스가 없던 곳. 0224(강화 작업)와 같은 이유로, 행이 쌓이면
-- 탈퇴·아바타 반환이 테이블 전체를 훑는다. 지금은 수천 행이라 빠르지만 계속 커지는 테이블이다.
--  · whisper_messages.from_user_id / to_user_id — 탈퇴 때 귓속말 삭제(from OR to)
--  · expeditions.avatar_profile_id — 아바타 삭제(반환·탈퇴) 시 ON DELETE SET NULL, 부분 인덱스만 있었다
-- CONCURRENTLY는 트랜잭션 안에서 못 돌린다 — apply-migration.ts 대신 단독 실행할 것.
create index concurrently if not exists whisper_messages_from_user_idx on whisper_messages (from_user_id);
create index concurrently if not exists whisper_messages_to_user_idx on whisper_messages (to_user_id);
create index concurrently if not exists expeditions_avatar_profile_idx on expeditions (avatar_profile_id);
