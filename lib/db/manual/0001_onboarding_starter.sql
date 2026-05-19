-- ───────────────────────────────────────────────────────────────────────────
-- 0001 온보딩 스타터 — 회원가입 트리거 + 기존 유저 백필 (1회 적용)
--
-- 배경: 프로필 생성 로직 전무(콜백=세션교환, 트리거 없음) + 스타터 미지급 →
--   신규/기존 유저 보급 0 = 진행 불가(소프트락). 앱 핫패스 부트스트랩은 폐기,
--   Supabase 표준 패턴(auth.users INSERT 트리거)으로 전환.
--
-- 적용: Supabase SQL Editor에서 *프로덕션 DB*에 1회 실행 권장(auth 스키마 트리거 +
--   기존 데이터 백필이라 명시적 검토 실행). 멱등 — 재실행해도 중복 지급 없음.
--
-- 스타터: 보석 5 (GDD §355) + 슬롯별 보급 2 (GDD §431 "1세트"). tutorial_step=1 마킹.
-- ───────────────────────────────────────────────────────────────────────────

-- 1) 신규 유저 트리거 함수 ----------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname, diamond, tutorial_step)
  values (
    new.id,
    '용사' || substr(replace(new.id::text, '-', ''), 1, 12),
    5,        -- STARTER_GEMS
    1         -- 스타터 지급 완료 마킹
  )
  on conflict (id) do nothing;

  insert into public.user_supply_boxes (user_id, slot, count)
  values
    (new.id, 'weapon',    2),   -- STARTER_BOXES_PER_SLOT
    (new.id, 'armor',     2),
    (new.id, 'accessory', 2)
  on conflict (user_id, slot) do nothing;

  return new;
end;
$$;

-- 2) auth.users INSERT 트리거 (재적용 안전) -----------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) 기존 유저 백필 (멱등) ----------------------------------------------------
-- 3a. 프로필 없는 기존 auth.users → 생성 + 스타터 마킹
insert into public.profiles (id, nickname, diamond, tutorial_step)
select u.id,
       '용사' || substr(replace(u.id::text, '-', ''), 1, 12),
       5, 1
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- 3b. 프로필은 있으나 스타터 미수령(tutorial_step=0) → 보석 지급 + 마킹
update public.profiles
set diamond = diamond + 5,
    tutorial_step = 1
where tutorial_step = 0;

-- 3c. 보급 스타터 — 보급 행이 전혀 없는 모든 프로필에 슬롯별 지급(멱등)
insert into public.user_supply_boxes (user_id, slot, count)
select p.id, s.slot, 2
from public.profiles p
cross join (values ('weapon'::slot), ('armor'::slot), ('accessory'::slot)) as s(slot)
where not exists (
  select 1 from public.user_supply_boxes b where b.user_id = p.id
)
on conflict (user_id, slot) do nothing;
