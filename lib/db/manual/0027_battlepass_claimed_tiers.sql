-- 0027 성장패스 개별 수령 — watermark → 수령 단계 집합(jsonb).
-- 클릭한 마일스톤만 수령(비순차) 지원. 기존 watermark 컬럼은 안전을 위해 유지(미사용).
-- 백필은 _apply-0027.ts(JS)에서 type별 step으로 마일스톤 배열 생성. 멱등(IF NOT EXISTS).
alter table public.battlepass_state
  add column if not exists free_claimed_tiers jsonb not null default '[]'::jsonb;
alter table public.battlepass_segments
  add column if not exists premium_claimed_tiers jsonb not null default '[]'::jsonb;
