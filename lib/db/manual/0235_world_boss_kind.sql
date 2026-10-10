-- 0235 월드보스 종류(boss_code) — 다른 컨셉의 보스를 더할 전제(10-11 사용자). 지금은 '잿불의 불사조'(ember_phoenix) 하나.
-- 이름·그림·문장 풀은 코드 레지스트리(lib/game/world-boss/bosses.ts)가 코드로 찾는다. region은 출현 구역의 지역(배경·지역색)으로 남긴다.
alter table world_bosses add column if not exists boss_code text not null default 'ember_phoenix';
