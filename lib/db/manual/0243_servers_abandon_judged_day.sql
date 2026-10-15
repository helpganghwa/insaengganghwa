-- 0243 (2026-10-15) — 방치 판정(markAbandonedZones, run.ts) **전투일당 1회** 표식.
-- 판정은 zones의 현재 집행관을 보는데 00시대 백스톱 크론이 5분마다 다시 돌려, 자정 뒤 길드 탈퇴로
-- 집행관이 빈 구역이 이미 끝난 전투일의 방치로 소급 처리됐다(2026-10-14 00:19 탈퇴 → 00:20 틱, 잊힌 숲길).
-- 자정 공개 직후 한 번 판정하고 여기 전투일을 적는다. 같은 날짜면 이후 호출은 건너뛴다.
alter table public.servers add column if not exists abandon_judged_day date;
