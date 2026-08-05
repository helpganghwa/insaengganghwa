-- 칭호 시스템(TITLES.md §4) — 발견 원장 + 대표 칭호.
-- 원장은 전 유형의 "최초 발견" 기록(조건부 포함). 활성 여부는 실시간 파생이라 저장하지 않는다.
create table if not exists user_titles (
  user_id    uuid not null references profiles(id) on delete cascade,
  server_id  smallint not null,
  title_code text not null,
  earned_at  timestamptz not null default now(),
  primary key (user_id, title_code)
);
-- 프로필별 발견 목록 조회는 PK 선두(user_id)로 충분. 칭호별 통계는 후속(§7).

alter table profiles add column if not exists representative_title_code text;
