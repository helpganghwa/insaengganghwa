-- 0067 가입 트리거 v9 — 계정 행만 생성(캐릭터/보너스는 콜백이 "고른 서버"에 단일 생성). 멱등.
--   배경: 트리거가 최신 open 서버에 캐릭터+보너스를 미리 만들어, 유저가 공유링크/선택으로
--   다른 서버를 고르면 OAuth 콜백(createCharacterAuto)이 그 서버에 또 만들어 캐릭터·보너스가
--   2벌(한쪽은 유령)이 됐다.
--   해결: 트리거는 profiles(계정) 행만 만든다. 캐릭터·가입보너스·기본아바타·거주지는
--   콜백/로그인 액션의 createCharacter(server-select.ts)가 유저가 고른 서버에 정확히 1개 생성.
--   부수효과: 가입 보너스 값 단일 출처가 TS(SIGNUP_DIAMOND/SIGNUP_BOX_PER_SLOT)로 통일
--   (트리거 하드코딩 5000/50 ↔ TS desync 제거).
--
--   ⚠ 적용 순서: 반드시 새 OAuth 콜백/로그인 코드 배포 후(또는 동시) 적용. 구 콜백은
--   login_srv가 없을 때 캐릭터를 만들지 않으므로, 코드 배포 전 적용하면 일부 신규가입이
--   캐릭터 없는 계정이 될 수 있다.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server smallint;
begin
  -- last_server_id = 최신 open 서버(콜백이 login_srv 없을 때 쓰는 기본 닻). 캐릭터는 만들지 않는다.
  select coalesce(max(id), 1) into v_server from public.servers where status = 'open';
  insert into public.profiles (id, last_server_id) values (new.id, v_server)
  on conflict (id) do nothing;
  return new;
end;
$$;
