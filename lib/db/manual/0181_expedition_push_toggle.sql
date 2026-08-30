-- 0181 파견 귀환 푸시 토글 (2026-08-30)
-- 파견 귀환(push-expedition-ready)은 하루 최대 슬롯 수만큼 오는 고빈도 알림이라 강화 완료처럼 개인 토글을 둔다(기본 ON).
alter table profiles add column if not exists push_expedition boolean not null default true;
