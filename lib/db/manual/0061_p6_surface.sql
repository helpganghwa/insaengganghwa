-- 0061 P6a 표면 데이터(SERVER.md §5) — 아바타 서버별·shares 박제·결제 server_id + 레거시 정리. 멱등.

-- 1) P4/P5 전환기 레거시 정리(신코드 배포 완료).
drop index if exists raid_daily_counts_legacy_uq;
drop index if exists friend_links_legacy_uq;
drop index if exists guild_members_legacy_uq;
drop index if exists guild_join_requests_legacy_uq;
drop index if exists deploy_user_day_legacy_uq;
drop index if exists world_chronicle_legacy_uq;
-- melee_battles 구 battle_date 단독 UNIQUE(컬럼 제약) 제거 — (server_id, battle_date)가 대체.
do $$
declare con text;
begin
  select conname into con from pg_constraint
  where conrelid = 'melee_battles'::regclass and contype = 'u'
    and (select array_agg(attname::text order by attname)
         from unnest(conkey) k join pg_attribute a on a.attrelid = conrelid and a.attnum = k)
        = array['battle_date']::text[];
  if con is not null then execute format('alter table melee_battles drop constraint %I', con); end if;
end $$;

-- 2) AI 아바타 — 캐릭터 자산(SERVER.md §1). active 선택은 characters로.
alter table user_profiles add column if not exists server_id smallint not null default 1;
alter table characters add column if not exists active_profile_id uuid references user_profiles(id) on delete set null;

-- 백필: 계정의 기존 active 선택 → 1서버 캐릭터로.
update characters c
set active_profile_id = p.active_profile_id
from public.profiles p
where c.user_id = p.id and c.server_id = 1 and c.active_profile_id is null;

-- 3) 공유 카드 — 생성 시점 서버 박제(스냅샷과 동일 원칙).
alter table shares add column if not exists server_id smallint not null default 1;

-- 4) 결제 — 지급 대상 지갑 서버(SERVER.md §4). 미성년 한도는 계정 합산이라 변동 없음.
alter table iap_orders add column if not exists server_id smallint not null default 1;

-- 5) 가입 트리거 v5 — 기본 아바타 active 선택을 캐릭터에 기록(+ user_profiles 서버 귀속).
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

  insert into public.user_supply_boxes (user_id, server_id, slot, count)
  values
    (new.id, 1, 'weapon',    50),
    (new.id, 1, 'armor',     50),
    (new.id, 1, 'accessory', 50)
  on conflict (user_id, server_id, slot) do nothing;

  -- 기본 프로필 남/여 — 1서버 캐릭터 자산(active 선택은 characters에).
  if not exists (
    select 1 from public.user_profiles
    where user_id = new.id and server_id = 1 and (options->>'isDefault') = 'true'
  ) then
    insert into public.user_profiles
      (user_id, server_id, rotations, active_direction, pixellab_character_id, options, equipment_snapshot, description_prompt)
    values
      (new.id, 1, v_male_rot,   'south', 'ada89510-cb31-49f5-a5ff-94422d4443f0', '{"gender":"male","isDefault":true}'::jsonb,   '{}'::jsonb, '기본 프로필(대장장이 남)'),
      (new.id, 1, v_female_rot, 'south', '8197894c-b042-4f8a-9c8b-6532e6c5c6b5', '{"gender":"female","isDefault":true}'::jsonb, '{}'::jsonb, '기본 프로필(대장장이 여)');

    update public.characters c
    set active_profile_id = (
      select id from public.user_profiles
      where user_id = new.id and server_id = 1 and (options->>'isDefault') = 'true'
      order by random() limit 1
    )
    where c.user_id = new.id and c.server_id = 1 and c.active_profile_id is null;

    -- 전환기 미러(구코드 호환) — 0062에서 컬럼과 함께 제거.
    update public.profiles
    set active_profile_id = (
      select active_profile_id from public.characters where user_id = new.id and server_id = 1
    )
    where id = new.id and active_profile_id is null;
  end if;

  return new;
end;
$$;
