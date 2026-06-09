-- 0040 세금 2단계 — 구역 포인트 누적기 복원(포인트 100당 tax_diamond +1). 멱등. 실행: bun run scripts/_apply-0040.ts
-- 선행: 0036·0039(tax_diamond). zones에 tax_points 추가(0039에서 rename됐던 것과 별개 컬럼 — 둘 다 보유).
ALTER TABLE zones ADD COLUMN IF NOT EXISTS tax_points bigint NOT NULL DEFAULT 0;
