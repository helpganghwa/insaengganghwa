-- 0042 zones.lord_user_id → executor_user_id 컬럼 개명('영주'→'집행관' 용어 통일). 멱등.
-- FK(profiles, on delete set null)는 RENAME COLUMN으로 보존됨. 실행: bun run scripts/_apply-0042.ts
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'zones' AND column_name = 'lord_user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'zones' AND column_name = 'executor_user_id'
  ) THEN
    ALTER TABLE zones RENAME COLUMN lord_user_id TO executor_user_id;
  END IF;
END $$;
