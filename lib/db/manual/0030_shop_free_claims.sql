-- 0030 상점 무료 수령 — 슬롯(일일/주간/월간/가입) 주기 멱등. 멱등(IF NOT EXISTS). 실행: bun run scripts/_apply-0030.ts
CREATE TABLE IF NOT EXISTS shop_free_claims (
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slot       text NOT NULL,
  period_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slot)
);
