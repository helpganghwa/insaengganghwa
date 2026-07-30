-- 0142. 부길드장 권한(개인별)
--
-- 지금까지 부길드장 권한은 코드에 하드코딩돼 있었다 — 공지·소개·오픈채팅·일반 길드원 추방은
-- 가능, 나머지는 길드장 전속. 길드 운영을 나눠 맡는 길드가 많아(문의 #106·#107) 길드장이
-- 부길드장마다 열어줄 권한을 직접 고르게 한다.
--
-- 길드 단위가 아니라 **멤버 행**에 둔다 — 부길드장 해제 시 권한도 함께 사라지고, 다시 임명하면
-- 기본값에서 시작한다. 비트 정의는 lib/game/guild/permissions.ts(GUILD_PERM).
--   1 공지 · 2 소개 · 4 오픈채팅 · 8 가입심사 · 16 추방 · 32 집행관 · 64 배치 · 128 세금분배 · 256 문양
alter table guild_members add column if not exists permissions integer not null default 0;

-- 기존 부길드장 소급 — 지금 코드가 이미 허용하던 범위(공지·소개·오픈채팅 = 1+2+4)를 부여한다.
-- 추방은 지금 부길드장도 가능했지만 되돌릴 수 없는 동작이라 기본에서 빼고 길드장이 켜게 한다
-- (권한이 좁아지는 변화라 사전 공지 대상).
update guild_members set permissions = 7 where role = 'vice' and permissions = 0;
