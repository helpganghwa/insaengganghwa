-- 0044 신규 유저 가입 시 임의 거주지 자동 배정 + 기존 NULL 백필. 멱등.
-- profiles BEFORE INSERT 트리거로 residence_zone_id 미지정이면 랜덤 zone 배정(handle_new_user 무관).
-- 실행: bun run scripts/_apply-0044.ts

create or replace function public.set_default_residence()
returns trigger
language plpgsql
as $$
begin
  if new.residence_zone_id is null then
    new.residence_zone_id := (select id from public.zones order by random() limit 1);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_default_residence on public.profiles;
create trigger trg_default_residence
  before insert on public.profiles
  for each row execute function public.set_default_residence();

-- 기존 미배정 유저 백필 — 유저별 랜덤(루프로 random() 매행 재평가).
do $$
declare r record;
begin
  for r in select id from public.profiles where residence_zone_id is null loop
    update public.profiles
      set residence_zone_id = (select id from public.zones order by random() limit 1)
      where id = r.id;
  end loop;
end;
$$;
