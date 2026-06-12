-- 0058 코어 테이블 server_id 스코핑(SERVER.md §5 P3b) — 장비·강화·초월·보급·출석·우편·상점·배틀패스.
--   전 행 default 1(=1서버 귀속). 캐릭터 단위 유니크/PK는 server_id 포함으로 교체. 멱등.

-- 1) server_id 컬럼(default 1) — 상태 + 감사 테이블 전부.
alter table user_equipment      add column if not exists server_id smallint not null default 1 references servers(id);
alter table enhancement_jobs    add column if not exists server_id smallint not null default 1 references servers(id);
alter table enhancement_logs    add column if not exists server_id smallint not null default 1;
alter table gem_time_reductions add column if not exists server_id smallint not null default 1;
alter table transcend_logs      add column if not exists server_id smallint not null default 1;
alter table user_supply_boxes   add column if not exists server_id smallint not null default 1 references servers(id);
alter table supply_open_logs    add column if not exists server_id smallint not null default 1;
alter table user_checkin_state  add column if not exists server_id smallint not null default 1 references servers(id);
alter table checkin_claim_logs  add column if not exists server_id smallint not null default 1;
alter table mailbox             add column if not exists server_id smallint not null default 1;
alter table mail_claim_logs     add column if not exists server_id smallint not null default 1;
alter table daily_supply_grants add column if not exists server_id smallint not null default 1;
alter table shop_free_claims    add column if not exists server_id smallint not null default 1 references servers(id);
alter table shop_purchases      add column if not exists server_id smallint not null default 1 references servers(id);
alter table battlepass_state    add column if not exists server_id smallint not null default 1 references servers(id);
alter table battlepass_segments add column if not exists server_id smallint not null default 1 references servers(id);

-- 2) 캐릭터 단위 유니크 — (user, server) 신설. ⚠ 구 형태 유니크는 **전환기 보조**로 유지
--    (배포 전 라이브 구코드의 on conflict 타겟이 깨지지 않게). 1서버뿐이라 두 제약 의미 동일.
--    P3b 배포 후 0059에서 구 형태 전부 drop(서버 2 오픈의 전제).
drop index if exists ue_user_catalog_uq;
create unique index if not exists ue_user_catalog_uq on user_equipment (user_id, server_id, catalog_item_id);
create unique index if not exists ue_user_catalog_legacy_uq on user_equipment (user_id, catalog_item_id);

drop index if exists ej_user_slot_lane_running_uq;
create unique index if not exists ej_user_slot_lane_running_uq
  on enhancement_jobs (user_id, server_id, slot, slot_lane) where status = 'running';
create unique index if not exists ej_user_slot_lane_running_legacy_uq
  on enhancement_jobs (user_id, slot, slot_lane) where status = 'running';

drop index if exists checkin_logs_user_day_uniq;
create unique index if not exists checkin_logs_user_day_uniq
  on checkin_claim_logs (user_id, server_id, kst_day);
create unique index if not exists checkin_logs_user_day_legacy_uq
  on checkin_claim_logs (user_id, kst_day);

-- 3) PK 교체 — 복합 PK에 server_id 삽입 + 구 PK 형태는 보조 유니크로 유지(전환기).
do $$
declare pk text;
begin
  select conname into pk from pg_constraint where conrelid = 'user_supply_boxes'::regclass and contype = 'p';
  if pk is not null then execute format('alter table user_supply_boxes drop constraint %I', pk); end if;
  execute 'alter table user_supply_boxes add primary key (user_id, server_id, slot)';
end $$;
create unique index if not exists user_supply_boxes_legacy_uq on user_supply_boxes (user_id, slot);

do $$
declare pk text;
begin
  select conname into pk from pg_constraint where conrelid = 'user_checkin_state'::regclass and contype = 'p';
  if pk is not null then execute format('alter table user_checkin_state drop constraint %I', pk); end if;
  execute 'alter table user_checkin_state add primary key (user_id, server_id)';
end $$;
create unique index if not exists user_checkin_state_legacy_uq on user_checkin_state (user_id);

do $$
declare pk text;
begin
  select conname into pk from pg_constraint where conrelid = 'daily_supply_grants'::regclass and contype = 'p';
  if pk is not null then execute format('alter table daily_supply_grants drop constraint %I', pk); end if;
  execute 'alter table daily_supply_grants add primary key (user_id, server_id, kst_day)';
end $$;
create unique index if not exists daily_supply_grants_legacy_uq on daily_supply_grants (user_id, kst_day);

do $$
declare pk text;
begin
  select conname into pk from pg_constraint where conrelid = 'shop_free_claims'::regclass and contype = 'p';
  if pk is not null then execute format('alter table shop_free_claims drop constraint %I', pk); end if;
  execute 'alter table shop_free_claims add primary key (user_id, server_id, slot)';
end $$;
create unique index if not exists shop_free_claims_legacy_uq on shop_free_claims (user_id, slot);

do $$
declare pk text;
begin
  select conname into pk from pg_constraint where conrelid = 'shop_purchases'::regclass and contype = 'p';
  if pk is not null then execute format('alter table shop_purchases drop constraint %I', pk); end if;
  execute 'alter table shop_purchases add primary key (user_id, server_id, product_id)';
end $$;
create unique index if not exists shop_purchases_legacy_uq on shop_purchases (user_id, product_id);

do $$
declare pk text;
begin
  select conname into pk from pg_constraint where conrelid = 'battlepass_state'::regclass and contype = 'p';
  if pk is not null then execute format('alter table battlepass_state drop constraint %I', pk); end if;
  execute 'alter table battlepass_state add primary key (user_id, server_id, pass_type)';
end $$;
create unique index if not exists battlepass_state_legacy_uq on battlepass_state (user_id, pass_type);

do $$
declare pk text;
begin
  select conname into pk from pg_constraint where conrelid = 'battlepass_segments'::regclass and contype = 'p';
  if pk is not null then execute format('alter table battlepass_segments drop constraint %I', pk); end if;
  execute 'alter table battlepass_segments add primary key (user_id, server_id, pass_type, segment_index)';
end $$;
create unique index if not exists battlepass_segments_legacy_uq on battlepass_segments (user_id, pass_type, segment_index);

-- 4) 가입 트리거 v4 — 보급상자 적재가 새 PK(user, server, slot)를 타겟.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_nickname text;
  attempts int := 0;
  max_attempts constant int := 10;
  v_male_rot jsonb := '{"south":"/sprites/default/male/south.png","south_east":"/sprites/default/male/south_east.png","east":"/sprites/default/male/east.png","north_east":"/sprites/default/male/north_east.png","north":"/sprites/default/male/north.png","north_west":"/sprites/default/male/north_west.png","west":"/sprites/default/male/west.png","south_west":"/sprites/default/male/south_west.png"}'::jsonb;
  v_female_rot jsonb := '{"south":"/sprites/default/female/south.png","south_east":"/sprites/default/female/south_east.png","east":"/sprites/default/female/east.png","north_east":"/sprites/default/female/north_east.png","north":"/sprites/default/female/north.png","north_west":"/sprites/default/female/north_west.png","west":"/sprites/default/female/west.png","south_west":"/sprites/default/female/south_west.png"}'::jsonb;
begin
  loop
    new_nickname := public.generate_korean_nickname();
    begin
      insert into public.profiles (id, nickname, tutorial_step)
      values (new.id, new_nickname, 1);
      insert into public.characters (user_id, server_id, nickname, diamond, tutorial_step, last_seen_at)
      values (new.id, 1, new_nickname, 5000, 1, now());
      exit;
    exception when unique_violation then
      if exists (select 1 from public.profiles where id = new.id)
         and exists (select 1 from public.characters where user_id = new.id and server_id = 1) then
        exit;
      end if;
      attempts := attempts + 1;
      if attempts >= max_attempts then
        new_nickname := substr(new_nickname, 1, 8)
                     || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
        insert into public.profiles (id, nickname, tutorial_step)
        values (new.id, new_nickname, 1)
        on conflict (id) do nothing;
        insert into public.characters (user_id, server_id, nickname, diamond, tutorial_step, last_seen_at)
        values (new.id, 1, new_nickname, 5000, 1, now())
        on conflict (user_id, server_id) do nothing;
        exit;
      end if;
    end;
  end loop;

  -- 보급상자 — 슬롯별 50개씩(테스트 ×5). 캐릭터(1서버) 귀속.
  insert into public.user_supply_boxes (user_id, server_id, slot, count)
  values
    (new.id, 1, 'weapon',    50),
    (new.id, 1, 'armor',     50),
    (new.id, 1, 'accessory', 50)
  on conflict (user_id, server_id, slot) do nothing;

  if not exists (
    select 1 from public.user_profiles
    where user_id = new.id and (options->>'isDefault') = 'true'
  ) then
    insert into public.user_profiles
      (user_id, rotations, active_direction, pixellab_character_id, options, equipment_snapshot, description_prompt)
    values
      (new.id, v_male_rot,   'south', 'ada89510-cb31-49f5-a5ff-94422d4443f0', '{"gender":"male","isDefault":true}'::jsonb,   '{}'::jsonb, '기본 프로필(대장장이 남)'),
      (new.id, v_female_rot, 'south', '8197894c-b042-4f8a-9c8b-6532e6c5c6b5', '{"gender":"female","isDefault":true}'::jsonb, '{}'::jsonb, '기본 프로필(대장장이 여)');

    update public.profiles
    set active_profile_id = (
      select id from public.user_profiles
      where user_id = new.id and (options->>'isDefault') = 'true'
      order by random() limit 1
    )
    where id = new.id and active_profile_id is null;
  end if;

  return new;
end;
$$;
