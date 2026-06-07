-- 0031 상점 구매 주기 제한 — 일일/주간/월간 상품 그 기간 1회. 멱등. 실행: bun run scripts/_apply-0031.ts
CREATE TABLE IF NOT EXISTS shop_purchases (
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  period_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
