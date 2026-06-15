-- 0066 지역 단계 개방(콜드스타트) 롤백 — zones.locked 제거 + 가입 트리거 v8 복원. 멱등.
--   콜드스타트(0065) 폐기: 안개 연출 품질 미달로 기능 전체 철회. 전 구역 즉시 개방으로 복귀.
--   순서: ① 트리거를 locked 미참조(v8)로 복원 → ② 컬럼 drop(트리거가 참조하지 않게 된 뒤).

-- ① 가입 트리거 v8 복원 — 거주지 랜덤 풀에서 locked 필터 제거(0064와 동일, 전 구역 대상).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server smallint;
  v_zone integer;
  new_nickname text;
  attempts int := 0;
  max_attempts constant int := 10;
  v_male_rot jsonb := '{"south":"/sprites/default/male/south.png","south_east":"/sprites/default/male/south_east.png","east":"/sprites/default/male/east.png","north_east":"/sprites/default/male/north_east.png","north":"/sprites/default/male/north.png","north_west":"/sprites/default/male/north_west.png","west":"/sprites/default/male/west.png","south_west":"/sprites/default/male/south_west.png"}'::jsonb;
  v_female_rot jsonb := '{"south":"/sprites/default/female/south.png","south_east":"/sprites/default/female/south_east.png","east":"/sprites/default/female/east.png","north_east":"/sprites/default/female/north_east.png","north":"/sprites/default/female/north.png","north_west":"/sprites/default/female/north_west.png","west":"/sprites/default/female/west.png","south_west":"/sprites/default/female/south_west.png"}'::jsonb;
begin
  select coalesce(max(id), 1) into v_server from public.servers where status = 'open';
  select id into v_zone from public.zones
  where server_id = v_server
  order by random() limit 1;

  insert into public.profiles (id, last_server_id) values (new.id, v_server)
  on conflict (id) do nothing;

  loop
    new_nickname := public.generate_korean_nickname();
    begin
      insert into public.characters (user_id, server_id, nickname, diamond, tutorial_step, residence_zone_id, last_seen_at)
      values (new.id, v_server, new_nickname, 5000, 1, v_zone, now());
      exit;
    exception when unique_violation then
      if exists (select 1 from public.characters where user_id = new.id and server_id = v_server) then
        exit;
      end if;
      attempts := attempts + 1;
      if attempts >= max_attempts then
        new_nickname := substr(new_nickname, 1, 8)
                     || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
        insert into public.characters (user_id, server_id, nickname, diamond, tutorial_step, residence_zone_id, last_seen_at)
        values (new.id, v_server, new_nickname, 5000, 1, v_zone, now())
        on conflict (user_id, server_id) do nothing;
        exit;
      end if;
    end;
  end loop;

  insert into public.user_supply_boxes (user_id, server_id, slot, count)
  values
    (new.id, v_server, 'weapon',    50),
    (new.id, v_server, 'armor',     50),
    (new.id, v_server, 'accessory', 50)
  on conflict (user_id, server_id, slot) do nothing;

  if not exists (
    select 1 from public.user_profiles
    where user_id = new.id and server_id = v_server and (options->>'isDefault') = 'true'
  ) then
    insert into public.user_profiles
      (user_id, server_id, rotations, active_direction, pixellab_character_id, options, equipment_snapshot, description_prompt)
    values
      (new.id, v_server, v_male_rot,   'south', 'ada89510-cb31-49f5-a5ff-94422d4443f0', '{"gender":"male","isDefault":true}'::jsonb,   '{}'::jsonb, '기본 프로필(대장장이 남)'),
      (new.id, v_server, v_female_rot, 'south', '8197894c-b042-4f8a-9c8b-6532e6c5c6b5', '{"gender":"female","isDefault":true}'::jsonb, '{}'::jsonb, '기본 프로필(대장장이 여)');

    update public.characters c
    set active_profile_id = (
      select id from public.user_profiles
      where user_id = new.id and server_id = v_server and (options->>'isDefault') = 'true'
      order by random() limit 1
    )
    where c.user_id = new.id and c.server_id = v_server and c.active_profile_id is null;
  end if;

  return new;
end;
$$;

-- ② locked 컬럼 제거 — 트리거가 더는 참조하지 않으므로 안전. 전 구역이 즉시 개방 상태로 복귀.
alter table zones drop column if exists locked;
