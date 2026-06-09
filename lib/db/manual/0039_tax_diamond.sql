-- 0039 세금 모델 변경 — 지역에 포인트가 아닌 💎 직접 누적(영주 수금 시 영주 10%/길드 90%). 멱등.
-- 실행: bun run scripts/_apply-0039.ts. 선행: 0036. (세금 데이터 없으므로 단순 컬럼 rename.)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='zones' AND column_name='tax_points') THEN
    ALTER TABLE zones RENAME COLUMN tax_points TO tax_diamond;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guilds' AND column_name='tax_pool_points') THEN
    ALTER TABLE guilds RENAME COLUMN tax_pool_points TO tax_pool_diamond;
  END IF;
END $$;
