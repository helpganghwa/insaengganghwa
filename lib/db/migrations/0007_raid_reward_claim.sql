-- 레이드 결산 보상을 우편함이 아닌 상세 페이지에서 직접 수령(grow 흐름).
-- IS NULL = 미수령. 조건부 stamping(`WHERE claimed_at IS NULL`)으로 동시 수령 레이스 차단.
ALTER TABLE "raid_rewards" ADD COLUMN IF NOT EXISTS "claimed_at" timestamptz;
