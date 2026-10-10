-- 0232: 월드보스 특성(2026-10-10, docs/WORLD-BOSS.md §3.5) — 소환 때 추첨한 특성 코드 0~2개(jsonb 문자열 배열).
--  - 옛 행은 '[]' = 특성 없음(기본값으로 처리). 신설 칸뿐이라 코드보다 먼저 적용해도 무해.
-- ⚠ 0228 뒤, 코드보다 **반드시 먼저** 적용할 것(없으면 보스 조회·소환이 실패한다).
begin;
set local lock_timeout = '3s';

alter table world_bosses add column if not exists traits jsonb not null default '[]'::jsonb;

commit;
