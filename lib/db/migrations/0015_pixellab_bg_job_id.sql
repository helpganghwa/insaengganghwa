-- 0015_pixellab_bg_job_id.sql — profile_generation_jobs.pixellab_background_job_id 추가.
-- Pixellab v2는 character_id와 background_job_id가 분리 — polling은 background_job_id로,
-- 다운로드는 character_id로 사용. pipeline.ts 수정과 함께 적용.

ALTER TABLE "profile_generation_jobs"
  ADD COLUMN IF NOT EXISTS "pixellab_background_job_id" text;
