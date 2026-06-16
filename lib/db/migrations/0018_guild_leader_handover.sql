-- 0018_guild_leader_handover.sql — 길드장 7일 자동 위임 (GUILD §4).
-- 5일차 경고 우편 1회 멱등 키. 위임 완료/길드장 재활동(미접속<5일) 시 null 리셋.
-- nullable·additive — 기존 행 영향 없음.

ALTER TABLE "guilds"
  ADD COLUMN IF NOT EXISTS "leader_handover_warned_at" timestamptz;
