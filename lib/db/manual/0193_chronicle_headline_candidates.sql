-- 0193: 연대기 헤드라인 후보(2026-09-04) — 생성 시 문형이 다른 후보 3~5개를 저장해 검수 화면에서 고르게 한다.
--  nullable·기본값 없음이라 옛 코드와 호환(무시됨). 이전 행은 null(후보 없음).
begin;

alter table world_chronicle add column if not exists headline_candidates jsonb;

commit;
