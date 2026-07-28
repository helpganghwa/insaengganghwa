-- 0138: 룬 시스템 — 아바타 생성 시 지급되는 PvP 속성 세트(3줄 불변, §10 공시 1:1).
-- 아바타와 독립 관리(삭제 무관). 장착 1개 + 교체 쿨 72h(다이아 단축).
-- 2026-07-28 아바타 속성 확정 기획. 적용: 스테이징 → 프로덕션(코드 배포 전).

create table if not exists runes (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null default 1,
  attrs jsonb not null,
  source_profile_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists runes_user_server_idx on runes (user_id, server_id);
create unique index if not exists runes_source_profile_uq on runes (source_profile_id);

alter table characters add column if not exists equipped_rune_id bigint;
alter table characters add column if not exists rune_changed_at timestamptz;
