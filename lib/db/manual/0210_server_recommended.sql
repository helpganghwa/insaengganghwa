-- 0210 (2026-09-21) 추천 서버를 운영자가 지정 — 2서버 남은 결정 D1.
--
-- 종전: 신규는 무조건 '가장 최근에 연 서버'로 갔다(가입 트리거·콜백 폴백·로그인 화면 추천 라벨
--       세 곳이 같은 규칙). 2서버를 여는 순간 1서버에는 신규가 끊겨, 서버를 여는 날과 신규를
--       받기 시작하는 날을 따로 정할 수 없었다.
-- 이제: servers.recommended = true 인 open 서버가 신규의 기본 서버다(어드민 /admin/servers에서
--       지정). 지정이 없거나 그 서버가 open이 아니면 종전처럼 최신 open 서버로 떨어진다.
--
-- ⚠ **코드보다 먼저** 적용한다(추가만 하는 변경 — 구코드는 새 컬럼을 모른 채 그대로 동작한다).
--   지금의 최신 open 서버를 추천으로 찍어 두므로 적용 전후의 동작은 같다.
alter table servers add column if not exists recommended boolean not null default false;

-- 추천은 한 곳만.
create unique index if not exists servers_one_recommended_uq on servers (recommended) where recommended;

update servers set recommended = true
 where id = (select max(id) from servers where status = 'open')
   and not exists (select 1 from servers where recommended);

-- 가입 트리거 v10 — 계정 행의 last_server_id(콜백이 아무 단서가 없을 때 쓰는 닻)도 같은 규칙으로.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server smallint;
begin
  select id into v_server from public.servers where recommended and status = 'open' limit 1;
  if v_server is null then
    select coalesce(max(id), 1) into v_server from public.servers where status = 'open';
  end if;
  insert into public.profiles (id, last_server_id) values (new.id, v_server)
  on conflict (id) do nothing;
  return new;
end;
$$;
