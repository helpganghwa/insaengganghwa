-- 0184: 대난투 헤드라인(2026-09-03) — 결과 우편·결과 화면에 실을 "오늘의 대난투" 3~4줄.
-- 09:00 산출 직후 규칙 엔진(lib/game/melee/headlines.ts)이 후보·자동 선택을 만들어 여기 저장하고,
-- 운영자가 /admin/preview에서 09:00~10:00 사이에 고른 뒤 10:00 발표(reveal)가 picks를 우편에 붙인다.
-- 형식: { candidates: [{code, category, text, score, subjects}], picks: [{code, text, subjects?}], generatedAt, editedAt? }
begin;

alter table melee_battles add column if not exists headlines jsonb;

commit;
