-- 0119 연대기 AI 재검수(2026-07-15) — 검수 수정 내역(JSON 배열: {kind, before, after, reason})
-- 어드민 공개 전 검수 페이지에 diff로 노출. 초안 그대로면 null 또는 [].
alter table world_chronicle add column if not exists review_notes jsonb;
