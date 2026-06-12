-- 0057 캐릭터 정체성 이관(SERVER.md §5 P3) — 닉네임·튜토리얼·거주지·lastSeen·닉변카운트
--   profiles → characters. 닉네임은 전 캐릭터 전역 유일(UNIQUE). 멱등.
--   전환 기간(1서버): 닉네임은 characters(권위) + profiles(미러) 이중 기록 — 가입/닉변이
--   두 UNIQUE를 함께 만족시켜 네임스페이스 분기 차단. profiles.nickname drop 시 미러 종료.

alter table characters add column if not exists nickname text;
alter table characters add column if not exists nickname_changed_count integer not null default 0;
alter table characters add column if not exists tutorial_step integer not null default 0;
alter table characters add column if not exists residence_zone_id integer;
alter table characters add column if not exists last_seen_at timestamptz;

-- 백필(1서버) — 미설정 행만.
update characters c
set nickname = p.nickname,
    nickname_changed_count = p.nickname_changed_count,
    tutorial_step = p.tutorial_step,
    residence_zone_id = p.residence_zone_id,
    last_seen_at = p.last_seen_at
from public.profiles p
where c.user_id = p.id and c.nickname is null;

alter table characters alter column nickname set not null;
create unique index if not exists characters_nickname_uq on characters (nickname);
create index if not exists characters_residence_idx on characters (residence_zone_id);

-- 가입 트리거 v3 — 캐릭터에 정체성 적재(+지갑), profiles에는 닉네임 미러. 두 UNIQUE 충돌 모두 재시도.
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
  -- 한글 닉네임(0005) — profiles(미러)·characters(권위) 두 UNIQUE 충돌 시 재시도 + fallback.
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
        exit; -- 트리거 중복 발화 — 이미 생성됨
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
