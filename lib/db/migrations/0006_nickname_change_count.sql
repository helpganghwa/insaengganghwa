-- 닉네임 변경 횟수 (2026-05-21).
-- 첫 변경 무료 / 이후 변경마다 1000 다이아.
alter table profiles add column if not exists nickname_changed_count integer not null default 0;
