-- 대난투 전체 순위(2026-07-28) — 순위표에 필요한 두 값을 참가자 행에 저장.
-- ⚠ 소급 불가: 기존 회차는 NULL(화면에서 '—' 처리). 다음 회차부터 채워진다.
alter table melee_participants add column if not exists eliminated_round integer;
alter table melee_participants add column if not exists guild_name text;
alter table melee_participants add column if not exists guild_emblem_url text;
