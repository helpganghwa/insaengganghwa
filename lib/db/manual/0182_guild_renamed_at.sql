-- 0182 길드명 변경 (2026-08-30) — 마지막 변경 시각. null=한 번도 안 바꿈.
-- 규칙: 결성 GUILD_RENAME_AFTER_DAYS(7일) 뒤 첫 변경, 이후 GUILD_RENAME_COOLDOWN_DAYS(30일)마다.
alter table guilds add column if not exists renamed_at timestamptz;
