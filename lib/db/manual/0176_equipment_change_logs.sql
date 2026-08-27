-- 0176 장비 장착/해제 이력 (2026-08-26)
-- 아바타 생성 분쟁("생성 중 장비를 바꿨는데 바뀐 장비로 나왔다")에서 교체 시각을 증명할 기록이
-- 없었다 — user_equipment.equipped_slot은 현재값만 갖는다. 장착·해제 한 건당 한 행. 외형 전용
-- 상태라 게임 판정에는 쓰지 않고 운영 조사(profile_generation_jobs.created_at과 대조)용.

create table if not exists equipment_change_logs (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  server_id integer not null,
  slot slot not null,
  -- 교체 전/후 카탈로그(해제면 to null, 빈 슬롯에 장착이면 from null)
  from_catalog_item_id integer,
  to_catalog_item_id integer,
  created_at timestamptz not null default now()
);
create index if not exists ecl_user_time_idx on equipment_change_logs (user_id, created_at desc);
