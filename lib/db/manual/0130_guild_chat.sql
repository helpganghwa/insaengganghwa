-- 0130: 길드 채팅(2026-07-21) — chat_messages에 guild_id 채널 분리.
-- null = 전체(서버) 채팅, 값 = 해당 길드 채팅. 조회 인덱스는 (server_id, guild_id, id desc).
alter table chat_messages add column if not exists guild_id bigint;
create index if not exists chat_msg_guild_idx on chat_messages (server_id, guild_id, id desc);
