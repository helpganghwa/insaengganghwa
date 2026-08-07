-- 칭호 서버별화 (2026-08-07 확정) — SERVER.md §1 분류표(칭호=서버별)를 구현에 반영.
-- 배경: user_titles PK가 (user_id, title_code)라 서버2에서 재달성해도 행이 안 생기고,
-- 대표 칭호가 profiles 전역 컬럼이라 서버1 칭호가 서버2 캐릭터에 표시됐다(전수 감사 A1).
--
-- 적용: 스테이징 → 프로덕션 순. 코드 배포 **전에** 적용해야 함(새 컬럼 읽기 전환).

-- 1) 발견 원장 PK에 server_id 포함 — 기존 행은 '최초 발견 서버' 기록을 그대로 서버 귀속으로 사용
--    (현 운영 사실상 1서버라 데이터 의미 불변).
alter table public.user_titles drop constraint user_titles_pkey;
alter table public.user_titles add constraint user_titles_pkey primary key (user_id, server_id, title_code);

-- 2) 대표 칭호를 캐릭터(서버별)로 이관.
alter table public.characters add column if not exists representative_title_code text;

-- 3) 기존 대표 칭호 백필 — 유저의 활성 서버(last_server_id) 캐릭터로 복사(사실상 전원 1서버).
update public.characters c
set representative_title_code = p.representative_title_code
from public.profiles p
where p.id = c.user_id
  and c.server_id = p.last_server_id
  and p.representative_title_code is not null
  and c.representative_title_code is null;

-- profiles.representative_title_code 는 당분간 유지(구버전 인스턴스 호환) — 다음 정리 배치에서 드랍.
