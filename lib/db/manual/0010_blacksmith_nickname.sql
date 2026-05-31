-- ───────────────────────────────────────────────────────────────────────────
-- 0010 초기 닉네임 형식 변경 — '대장장이' + 6자리 난수 (1회 적용)
--
-- 변경: generate_korean_nickname()을 동사+색상+명사 조합에서
--       '대장장이' + 6자리(000000~999999) 난수로 교체. 정확히 10자(=NICKNAME_MAX_LEN).
--
-- handle_new_user는 0007의 다이아 10000/보급 100/기본 프로필 시드 로직을 유지하고,
-- max_attempts 50으로 늘림(난수 1,000,000 풀에서 사실상 충돌 X). 0005/0006/0007의
-- substr+숫자 fallback은 새 형식이 이미 10자 정확이라 제거(자수 한도 침범 가능 회피).
-- ───────────────────────────────────────────────────────────────────────────

-- 1) generate_korean_nickname 교체 ----------------------------------------
create or replace function public.generate_korean_nickname()
returns text
language plpgsql
as $$
begin
  return '대장장이' || lpad(floor(random() * 1000000)::int::text, 6, '0');
end;
$$;

-- 2) handle_new_user 재정의(0007 기반 — 다이아 10000, 보급 100, 기본 프로필) ----
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_nickname text;
  attempts int := 0;
  max_attempts constant int := 50;
  v_male_rot jsonb := '{"south":"/sprites/default/male/south.png","south_east":"/sprites/default/male/south_east.png","east":"/sprites/default/male/east.png","north_east":"/sprites/default/male/north_east.png","north":"/sprites/default/male/north.png","north_west":"/sprites/default/male/north_west.png","west":"/sprites/default/male/west.png","south_west":"/sprites/default/male/south_west.png"}'::jsonb;
  v_female_rot jsonb := '{"south":"/sprites/default/female/south.png","south_east":"/sprites/default/female/south_east.png","east":"/sprites/default/female/east.png","north_east":"/sprites/default/female/north_east.png","north":"/sprites/default/female/north.png","north_west":"/sprites/default/female/north_west.png","west":"/sprites/default/female/west.png","south_west":"/sprites/default/female/south_west.png"}'::jsonb;
begin
  -- 닉네임 — '대장장이' + 6자리. UNIQUE 충돌 재시도(50회). fallback 제거(자수 한도 안전).
  loop
    new_nickname := public.generate_korean_nickname();
    begin
      insert into public.profiles (id, nickname, diamond, tutorial_step)
      values (new.id, new_nickname, 10000, 1);
      exit;
    exception when unique_violation then
      if exists (select 1 from public.profiles where id = new.id) then exit; end if;
      attempts := attempts + 1;
      if attempts >= max_attempts then
        -- 매우 드문 케이스(1,000,000풀 50회 모두 충돌) — 마지막 시도로 강제 삽입.
        -- nickname UNIQUE 충돌이면 행 자체가 안 들어가므로 ON CONFLICT(id)로만 흡수.
        insert into public.profiles (id, nickname, diamond, tutorial_step)
        values (new.id, new_nickname, 10000, 1)
        on conflict (id) do nothing;
        exit;
      end if;
    end;
  end loop;

  -- 보급상자(테스트 보너스 100개 슬롯별).
  insert into public.user_supply_boxes (user_id, slot, count)
  values
    (new.id, 'weapon',    100),
    (new.id, 'armor',     100),
    (new.id, 'accessory', 100)
  on conflict (user_id, slot) do nothing;

  -- 기본 프로필 남/여 (0006 동일).
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
