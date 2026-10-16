-- 0244 (2026-10-15) 길드원 직급 R1~R3(유저 건의 #273·#374·#404·#459: 고참·신입 정보 편차, 배치 열람 범위).
-- 길드장 R5 · 부길드장 R4는 역할(role)에서 계산하고, 길드원만 이 열로 R1(기본, 가입 시)·R2·R3을 가진다.
-- 승급·강등은 길드장과 '직급 관리' 권한(1<<10)을 받은 부길드장. 부길드장 해제·길드장 교체로 길드원이 되면 R3.
-- 기존 길드원은 전부 R1에서 시작한다(공개 범위 기본값이 '전체'라 보이는 것은 그대로).
begin;
-- guild_members 잠금을 오래 기다리지 않는다(긴 트랜잭션 뒤에 줄 서면 길드 전 페이지가 밀린다). set local = 이 트랜잭션에만(풀러에 새지 않는다). 못 잡으면 실패할 뿐이라 다시 실행하면 된다.
set local lock_timeout = '3s';

alter table guild_members add column if not exists rank smallint not null default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'guild_members_rank_check') then
    alter table guild_members add constraint guild_members_rank_check check (rank between 1 and 3);
  end if;
end $$;
-- 배치 정보 공개 범위(0204)는 '전체 / R2 이상 / R3 이상 / R4 이상 / R5'로 바뀐다. 종전 'officer'(길드장 + 배치 권한 부길드장)는
-- 'R5'(길드장 + 배치 권한 부길드장)와 뜻이 같아 그대로 옮긴다. 코드(parseDeployVisibility)도 'officer'를 'r5'로 읽는다.
update guilds set deploy_visibility = 'r5' where deploy_visibility = 'officer';
commit;
