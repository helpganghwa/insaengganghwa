-- 0246 (2026-10-21) 강화 프리셋(유저 건의 소서 #492, docs/WIREFRAMES.md §2.4).
--  - enhance_presets: (유저, 서버, 프리셋 번호 1~3) 이름 + 6칸 상태(lanes jsonb).
--    칸 키 "weapon:1"·"weapon:2"·"armor:1"·"armor:2"·"accessory:1"·"accessory:2",
--    값 {"kind":"item","equipmentId":"<user_equipment.id>"} | {"kind":"keep"} | {"kind":"empty"}. 키가 없으면 keep.
--  - 3개 전부 무료(10-21 결정). 행이 없으면 빈 프리셋(이름 '프리셋 N', 전부 keep).
--  - 적용은 슬롯 교체와 같이 취소→등록(다 찬 게이지도 초기화, 수령 없음). 삭제는 계정 삭제 cascade뿐.
-- ⚠ 코드보다 **먼저** 적용할 것 — 표가 없으면 프리셋 팝업 조회가 오류를 낸다. 신설뿐이라 먼저 적용해도 무해.
begin;
set local lock_timeout = '3s';

create table if not exists enhance_presets (
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null,
  preset_no smallint not null check (preset_no between 1 and 3),
  name text not null default '',
  lanes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, server_id, preset_no)
);
alter table enhance_presets enable row level security;
commit;
