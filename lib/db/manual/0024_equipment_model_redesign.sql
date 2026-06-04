-- ───────────────────────────────────────────────────────────────────────────
-- 0024 장비 모델 재설계 — equipment_instances + user_codex → user_equipment (카탈로그당 1행)
--
-- 인스턴스 더미 폐기·카탈로그당 1레코드·자동초월·분해/강화제물 폐기(SCHEMA §2). 1회 적용
-- (구조 변경 + 데이터 이관). 테스트 데이터 보존 이관 — 인스턴스를 (user,catalog)별 집계.
-- ⚠️ 비멱등(구 테이블 drop) — 1회만 실행.
-- ───────────────────────────────────────────────────────────────────────────

-- 1) user_equipment 생성 -------------------------------------------------------
create table if not exists public.user_equipment (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  catalog_item_id integer not null references public.catalog_items(id),
  enhance_level integer not null default 0,
  transcend_level integer not null default 0,
  transcend_progress integer not null default 0,
  max_enhance_level integer not null default 0,
  max_enhance_reached_at timestamptz not null default now(),
  max_transcend_level integer not null default 0,
  max_transcend_reached_at timestamptz not null default now(),
  equipped_slot public.slot,
  first_acquired_at timestamptz not null default now(),
  constraint ue_enhance_min check (enhance_level >= 0),
  constraint ue_transcend_min check (transcend_level >= 0),
  constraint ue_transcend_progress_min check (transcend_progress >= 0)
);
create unique index if not exists ue_user_catalog_uq on public.user_equipment(user_id, catalog_item_id);
create index if not exists ue_user_slot_idx on public.user_equipment(user_id, equipped_slot) where equipped_slot is not null;

-- 2) 데이터 이관: 인스턴스 → (user,catalog) 집계 + codex 흡수 ----------------------
insert into public.user_equipment
  (user_id, catalog_item_id, enhance_level, transcend_level, transcend_progress,
   max_enhance_level, max_enhance_reached_at, max_transcend_level, max_transcend_reached_at,
   equipped_slot, first_acquired_at)
select agg.user_id, agg.catalog_item_id, agg.enhance_level, agg.transcend_level, 0,
       coalesce(c.max_enhance_level, agg.enhance_level), coalesce(c.max_enhance_reached_at, now()),
       coalesce(c.max_transcend_level, agg.transcend_level), coalesce(c.max_transcend_reached_at, now()),
       agg.equipped_slot, coalesce(c.first_acquired_at, now())
from (
  select user_id, catalog_item_id,
         max(enhance_level) as enhance_level,
         max(transcend_level) as transcend_level,
         max(equipped_slot) as equipped_slot
  from public.equipment_instances
  group by user_id, catalog_item_id
) agg
left join public.user_codex c on c.user_id = agg.user_id and c.catalog_item_id = agg.catalog_item_id
on conflict (user_id, catalog_item_id) do nothing;

-- codex만 있고 인스턴스 없는 행(도감 해금했으나 현재 미보유)도 이관
insert into public.user_equipment
  (user_id, catalog_item_id, max_enhance_level, max_enhance_reached_at,
   max_transcend_level, max_transcend_reached_at, first_acquired_at)
select c.user_id, c.catalog_item_id, c.max_enhance_level, c.max_enhance_reached_at,
       c.max_transcend_level, c.max_transcend_reached_at, c.first_acquired_at
from public.user_codex c
where not exists (select 1 from public.user_equipment u
                  where u.user_id = c.user_id and u.catalog_item_id = c.catalog_item_id)
on conflict (user_id, catalog_item_id) do nothing;

-- 3) enhancement_jobs: instance FK → user_equipment FK ------------------------
alter table public.enhancement_jobs add column if not exists user_equipment_id bigint;
update public.enhancement_jobs j
set user_equipment_id = u.id
from public.equipment_instances ei
join public.user_equipment u on u.user_id = ei.user_id and u.catalog_item_id = ei.catalog_item_id
where j.equipment_instance_id = ei.id;
delete from public.enhancement_jobs where user_equipment_id is null;  -- 매핑 실패(고아) 제거
alter table public.enhancement_jobs alter column user_equipment_id set not null;
alter table public.enhancement_jobs
  add constraint enhancement_jobs_user_equipment_id_fkey
  foreign key (user_equipment_id) references public.user_equipment(id) on delete cascade;
drop index if exists ej_instance_running_uq;
create unique index if not exists ej_equipment_running_uq
  on public.enhancement_jobs(user_equipment_id) where status = 'running';
alter table public.enhancement_jobs drop column if exists equipment_instance_id;
alter table public.enhancement_jobs drop column if exists fodder_instance_id;

-- 4) 로그 컬럼 정리 (append-only 값 보존, 컬럼명만 스키마 일치) ----------------------
alter table public.enhancement_logs rename column equipment_instance_id to user_equipment_id;
alter table public.enhancement_logs drop column if exists fodder_instance_id;
alter table public.transcend_logs rename column equipment_instance_id to user_equipment_id;
alter table public.transcend_logs drop column if exists fodder_instance_ids;
alter table public.transcend_logs alter column from_t type integer;
alter table public.transcend_logs alter column to_t type integer;

-- 5) 구 테이블 제거 ------------------------------------------------------------
drop table if exists public.disenchant_logs;
drop table if exists public.user_codex;
drop table if exists public.equipment_instances cascade;
