-- 0054 길드 오픈채팅 링크 — 카카오 오픈채팅 URL 1개(길드장/부길드장 설정, GUILD §1.5).
--   인게임 채팅 대신 외부 오픈채팅으로 소통(모더레이션 카카오 위임). 멱등.

alter table guilds add column if not exists openchat_url text;
