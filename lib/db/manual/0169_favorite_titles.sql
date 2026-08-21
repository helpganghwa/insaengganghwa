-- 0169: 칭호 즐겨찾기(2026-08-21, 칭호 화면 개편 트랙 D)
--
-- 자주 쓰는 칭호를 목록 최상단 ★ 섹션으로 상위 노출 + ★ 필터. 서버별(캐릭터 귀속),
-- 상한 10(토글 액션이 강제). 배열 원소 = 칭호 code 문자열(중복 없음).
alter table characters
  add column if not exists favorite_titles jsonb not null default '[]'::jsonb;
