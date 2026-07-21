-- 0132 (2026-07-21): 문양 검수용 생성 컨텍스트 — 선택 요소(jsonb)·사용 프롬프트(text).
-- 아바타 검수의 descriptionPrompt와 동일 목적(검수·분쟁 시 근거 확인). 신규 생성부터 기록.
ALTER TABLE guild_emblems
  ADD COLUMN IF NOT EXISTS selection jsonb,
  ADD COLUMN IF NOT EXISTS gen_prompt text;
