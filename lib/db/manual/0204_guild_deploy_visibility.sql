-- 0204 (2026-09-20) 점령전 배치 정보 공개 범위 — 길드 단위 설정(유저 건의: 배치가 길드 밖으로 새는 문제).
-- 'all'(기본, 종전과 같음) = 길드원 누구나 전원의 배치를 본다 / 'officer' = 배치 담당자(길드장 · 배치 해제/집행관 지정 권한 부길드장)만 전체, 나머지는 자기 배치만.
-- 기존 길드는 전부 'all'로 시작한다. 값 검증은 앱(parseDeployVisibility)에서 — 모르는 값은 'all'로 읽는다.
alter table guilds add column if not exists deploy_visibility text not null default 'all';
