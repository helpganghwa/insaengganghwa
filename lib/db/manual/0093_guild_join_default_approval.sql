-- 0093: 길드 가입 방식 기본값 open → approval(승인제)
-- 신규 길드는 기본 승인가입(길드장/부길드장 승인). createGuild가 명시 지정하지만
-- 스키마 기본값도 정합 유지. 기존 길드의 정책은 변경하지 않음(생성 시 기본값에만 영향).

alter table public.guilds alter column join_policy set default 'approval';
