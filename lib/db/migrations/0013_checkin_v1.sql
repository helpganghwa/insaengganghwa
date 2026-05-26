-- 0013_checkin_v1.sql — 28일 출석 캘린더 v1 (2026-05-26)
-- GDD §7 · BALANCE §7 · SCHEMA §12. 누적 출석, 끊겨도 자리 유지.
-- 1일 1회(KST 자정) 수령 — 1차 가드 state.last_claimed_kst_day, 2차 가드 logs UNIQUE.

-- §12.1 user_checkin_state — 1행/유저
CREATE TABLE IF NOT EXISTS "user_checkin_state" (
  "user_id"               uuid PRIMARY KEY REFERENCES "profiles"("id") ON DELETE CASCADE,
  "day_progress"          smallint     NOT NULL DEFAULT 0, -- 0~27 (다음 칸 1-index = dp+1)
  "last_claimed_kst_day"  date         NULL,
  "total_claimed_count"   bigint       NOT NULL DEFAULT 0,
  "updated_at"            timestamptz  NOT NULL DEFAULT now()
);

-- §12.2 checkin_claim_logs — append-only 감사 + 일일 멱등 가드
CREATE TABLE IF NOT EXISTS "checkin_claim_logs" (
  "id"                bigserial    PRIMARY KEY,
  "user_id"           uuid         NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "kst_day"           date         NOT NULL,
  "cycle_day"         smallint     NOT NULL, -- 1~28
  "diamond_granted"   bigint       NOT NULL DEFAULT 0,
  "boxes_granted"     jsonb        NOT NULL DEFAULT '{}'::jsonb,
  "claimed_at"        timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "checkin_logs_user_day_uniq"
  ON "checkin_claim_logs" ("user_id", "kst_day");
