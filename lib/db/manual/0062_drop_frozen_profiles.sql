-- 0062 P6 마감(SERVER.md §5) — profiles 동결 컬럼 제거 + 가입 트리거 v6(미러 종료). 멱등.
--   ⚠ P6b 코드 배포 **후** 적용(구코드가 미러 컬럼에 기록하므로). 적용 즉시 계정/캐릭터 분리 완성:
--   profiles = 계정(인증·결제·푸시·last_server)만, 게임 정체성·진행은 전부 characters.

-- 1) 가입 트리거 v6 — profiles는 계정 행만 생성(닉네임·미러 없음).
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
  -- 계정 행(전역 — 인증·결제·푸시 설정의 닻).
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;

  -- 1서버 캐릭터 — 닉네임(전 캐릭터 전역 유일) 생성·재시도.
  loop
    new_nickname := public.generate_korean_nickname();
    begin
      insert into public.characters (user_id, server_id, nickname, diamond, tutorial_step, last_seen_at)
      values (new.id, 1, new_nickname, 5000, 1, now());
      exit;
    exception when unique_violation then
      if exists (select 1 from public.characters where user_id = new.id and server_id = 1) then
        exit; -- 트리거 중복 발화
      end if;
      attempts := attempts + 1;
      if attempts >= max_attempts then
        new_nickname := substr(new_nickname, 1, 8)
                     || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
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
  end if;

  return new;
end;
$$;

-- 2) 동결 컬럼 제거 — 게임 정체성·진행은 characters가 단일 권위.
alter table profiles drop column if exists nickname;
alter table profiles drop column if exists diamond;
alter table profiles drop column if exists tutorial_step;
alter table profiles drop column if exists residence_zone_id;
alter table profiles drop column if exists last_seen_at;
alter table profiles drop column if exists nickname_changed_count;
alter table profiles drop column if exists active_profile_id;
alter table profiles drop column if exists representative_title_code;
