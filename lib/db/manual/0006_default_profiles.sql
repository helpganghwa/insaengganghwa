-- ───────────────────────────────────────────────────────────────────────────
-- 0006 기본 프로필(대장장이 남/여) 시드 — 가입 트리거 확장 + 기존 유저 백필 (1회 적용)
--
-- 배경: 모든 유저가 남/여 기본 프로필 2개를 보유(상세에서 방향 설정·삭제 가능),
--   활성 대표는 남/여 정면 중 랜덤. 8방향 PNG는 공유 정적 에셋
--   public/sprites/default/{gender}/{dir}.png (커밋 c3e3549).
--
-- 적용: Supabase SQL Editor에서 *프로덕션 DB*에 1회 실행. 멱등 — isDefault 프로필이
--   이미 있으면 재시드 안 함. handle_new_user 트리거(0001) 확장 + 기존 유저 백필.
--
-- user_profiles 전 컬럼 notNull: rotations·active_direction·pixellab_character_id·
--   options·equipment_snapshot·description_prompt. 기본 프로필은 options.isDefault=true.
-- ───────────────────────────────────────────────────────────────────────────

-- 공통: 남/여 8방향 rotations(정적 URL). active_direction 기본 'south'(정면).
--   male character_id=ada89510..., female=8197894c... (재추적용).

-- 1) handle_new_user 확장 — 기존 스타터 + 기본 프로필 남/여 시드 -------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_male_rot jsonb := '{"south":"/sprites/default/male/south.png","south_east":"/sprites/default/male/south_east.png","east":"/sprites/default/male/east.png","north_east":"/sprites/default/male/north_east.png","north":"/sprites/default/male/north.png","north_west":"/sprites/default/male/north_west.png","west":"/sprites/default/male/west.png","south_west":"/sprites/default/male/south_west.png"}'::jsonb;
  v_female_rot jsonb := '{"south":"/sprites/default/female/south.png","south_east":"/sprites/default/female/south_east.png","east":"/sprites/default/female/east.png","north_east":"/sprites/default/female/north_east.png","north":"/sprites/default/female/north.png","north_west":"/sprites/default/female/north_west.png","west":"/sprites/default/female/west.png","south_west":"/sprites/default/female/south_west.png"}'::jsonb;
begin
  insert into public.profiles (id, nickname, diamond, tutorial_step)
  values (
    new.id,
    '용사' || substr(replace(new.id::text, '-', ''), 1, 12),
    5,
    1
  )
  on conflict (id) do nothing;

  insert into public.user_supply_boxes (user_id, slot, count)
  values
    (new.id, 'weapon',    2),
    (new.id, 'armor',     2),
    (new.id, 'accessory', 2)
  on conflict (user_id, slot) do nothing;

  -- 기본 프로필 남/여 (멱등) + 활성 랜덤(정면)
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

-- 2) auth.users INSERT 트리거 재적용(안전) ------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) 기존 유저 백필 (멱등) ----------------------------------------------------
do $$
declare
  r record;
  v_male_rot jsonb := '{"south":"/sprites/default/male/south.png","south_east":"/sprites/default/male/south_east.png","east":"/sprites/default/male/east.png","north_east":"/sprites/default/male/north_east.png","north":"/sprites/default/male/north.png","north_west":"/sprites/default/male/north_west.png","west":"/sprites/default/male/west.png","south_west":"/sprites/default/male/south_west.png"}'::jsonb;
  v_female_rot jsonb := '{"south":"/sprites/default/female/south.png","south_east":"/sprites/default/female/south_east.png","east":"/sprites/default/female/east.png","north_east":"/sprites/default/female/north_east.png","north":"/sprites/default/female/north.png","north_west":"/sprites/default/female/north_west.png","west":"/sprites/default/female/west.png","south_west":"/sprites/default/female/south_west.png"}'::jsonb;
begin
  for r in select id from public.profiles loop
    if not exists (
      select 1 from public.user_profiles
      where user_id = r.id and (options->>'isDefault') = 'true'
    ) then
      insert into public.user_profiles
        (user_id, rotations, active_direction, pixellab_character_id, options, equipment_snapshot, description_prompt)
      values
        (r.id, v_male_rot,   'south', 'ada89510-cb31-49f5-a5ff-94422d4443f0', '{"gender":"male","isDefault":true}'::jsonb,   '{}'::jsonb, '기본 프로필(대장장이 남)'),
        (r.id, v_female_rot, 'south', '8197894c-b042-4f8a-9c8b-6532e6c5c6b5', '{"gender":"female","isDefault":true}'::jsonb, '{}'::jsonb, '기본 프로필(대장장이 여)');
    end if;

    -- 활성 프로필 없으면 기본 중 랜덤(정면) 부여
    update public.profiles
    set active_profile_id = (
      select id from public.user_profiles
      where user_id = r.id and (options->>'isDefault') = 'true'
      order by random() limit 1
    )
    where id = r.id and active_profile_id is null;
  end loop;
end $$;
