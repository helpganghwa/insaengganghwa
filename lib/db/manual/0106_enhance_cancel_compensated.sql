-- 0106: 강화 취소 피해 보상 멱등 마커
-- 어드민 보상 도구(compensateCancelDamageAction)가 취소 잡 누적 손실을 매번 전체 재계산해
-- 재클릭 시 과거 보상분까지 재지급되던 결함 수정 — 보상한 잡에 시각을 마킹하고
-- 미마킹 잡만 집계한다. 멱등.

alter table public.enhancement_jobs
  add column if not exists cancel_compensated_at timestamptz;
