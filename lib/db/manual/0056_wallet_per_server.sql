-- 0056 다이아 지갑 서버별 이관(SERVER.md §5 P2) — profiles.diamond → characters.diamond. 멱등.
--   profiles.diamond는 동결(미사용·P-후속에서 drop). 가입 트리거는 지갑을 characters에 적재.
--   ⚠ 코드 전환 배포 직후 [SYNC] 블록만 재실행해 적용~배포 사이 드리프트 재동기화.

alter table characters add column if not exists diamond bigint not null default 0;

-- [SYNC] profiles → characters(1서버) 잔액 동기화. 재실행 가능.
update characters c
set diamond = p.diamond
from public.profiles p
where c.user_id = p.id and c.server_id = 1 and c.diamond is distinct from p.diamond;

-- 가입 트리거 — 0028 본문 유지 + 지갑은 characters(1서버)로. profiles.diamond 적재 중단.
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
  -- 한글 닉네임(0005) — UNIQUE 충돌 재시도 + fallback.
  loop
    new_nickname := public.generate_korean_nickname();
    begin
      insert into public.profiles (id, nickname, tutorial_step)
      values (new.id, new_nickname, 1);
      exit;
    exception when unique_violation then
      if exists (select 1 from public.profiles where id = new.id) then exit; end if;
      attempts := attempts + 1;
      if attempts >= max_attempts then
        new_nickname := substr(new_nickname, 1, 8)
                     || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
        insert into public.profiles (id, nickname, tutorial_step)
        values (new.id, new_nickname, 1)
        on conflict (id) do nothing;
        exit;
      end if;
    end;
  end loop;

  -- 캐릭터(1서버) + 가입 보너스 지갑(테스트 ×5: 다이아 5000) — SERVER.md §1.
  insert into public.characters (user_id, server_id, diamond)
  values (new.id, 1, 5000)
  on conflict (user_id, server_id) do nothing;

  -- 보급상자 — 슬롯별 50개씩(테스트 보너스 ×5).
  insert into public.user_supply_boxes (user_id, slot, count)
  values
    (new.id, 'weapon',    50),
    (new.id, 'armor',     50),
    (new.id, 'accessory', 50)
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
