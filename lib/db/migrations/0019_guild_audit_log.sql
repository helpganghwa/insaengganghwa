-- 0019_guild_audit_log.sql — 길드 감사 로그 (GUILD §4 운영).
-- 임원/시스템 민감 액션 기록(추방·위임·부길드장·해산·가입정책·자동위임). 기록 전용(조회 UI 없음).
-- 역사 보존을 위해 guild/user FK 없음 — 길드 해산·계정 삭제 후에도 잔존. actor null = 시스템.

CREATE TABLE IF NOT EXISTS "guild_audit_log" (
  "id" bigserial PRIMARY KEY,
  "server_id" smallint NOT NULL DEFAULT 1,
  "guild_id" bigint NOT NULL,
  "actor_user_id" uuid,
  "action" text NOT NULL,
  "target_user_id" uuid,
  "detail" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "guild_audit_idx" ON "guild_audit_log" ("guild_id", "created_at");
