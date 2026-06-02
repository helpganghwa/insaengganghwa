-- 0021 프로필 공개 코드(public_code) — 닉네임 변경/재사용에도 안 깨지는 불변 식별자.
-- /u·/og·/s·추천 링크의 안정 식별자(닉네임 대체). 공유 Supabase 수동 적용.
-- 길이 8 base62 → 레이드 share_code(소문자영숫자 10자)와 길이로 구분(분기 충돌 없음).
-- 신규 가입은 트리거 수정 없이 컬럼 DEFAULT로 자동 부여.

-- 1) 코드 생성 함수(랜덤 base62, 길이 8).
create or replace function public.gen_public_code(len int default 8)
returns text
language plpgsql
volatile
as $$
declare
  chars constant text := '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  result text := '';
  i int;
begin
  for i in 1..len loop
    result := result || substr(chars, floor(random() * 62)::int + 1, 1);
  end loop;
  return result;
end;
$$;

-- 2) 컬럼 추가(우선 nullable) + 유니크 인덱스(널 다중 허용 — 백필 전).
alter table public.profiles add column if not exists public_code text;
create unique index if not exists profiles_public_code_key on public.profiles(public_code);

-- 3) 기존 행 백필 — 유니크 충돌 시 재생성 후 재시도.
do $$
declare
  r record;
  c text;
begin
  for r in select id from public.profiles where public_code is null loop
    loop
      c := public.gen_public_code();
      begin
        update public.profiles set public_code = c where id = r.id;
        exit;
      exception when unique_violation then
        -- 재생성 후 재시도
      end;
    end loop;
  end loop;
end;
$$;

-- 4) 신규 가입 자동 부여(DEFAULT) + NOT NULL 확정.
alter table public.profiles alter column public_code set default public.gen_public_code();
alter table public.profiles alter column public_code set not null;
