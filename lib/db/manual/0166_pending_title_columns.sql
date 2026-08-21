-- 0166: PENDING 칭호 12종 해소용 이력 컬럼(2026-08-21)
--
-- 거주(지박령·역마살·방랑 대장장이)·아바타 유지(한결같은 얼굴·단벌 신사)·길드 기부
-- (아낌없는 손·대들보)·집행관 역임(tour_lord)·강화 방치(잊혀진 불씨·천하태평)의 판정
-- 근거가 없어 PENDING이던 것을, 이벤트 시점에 채우는 경량 컬럼으로 해소한다.
-- 오픈 전 도입 이유: 나중에 넣으면 그 사이 이력이 유실되어 초기 유저가 손해를 본다.
alter table characters
  add column if not exists residence_since timestamptz,
  add column if not exists residence_move_count int not null default 0,
  add column if not exists visited_regions jsonb not null default '[]'::jsonb,
  add column if not exists active_profile_since timestamptz,
  add column if not exists guild_donation_count int not null default 0,
  add column if not exists executor_zone_history jsonb not null default '[]'::jsonb;

alter table enhancement_logs
  add column if not exists overdue_ms bigint;

-- 백필: 기존 캐릭터(복원 250)는 생성 시각을 거주·아바타 유지 시작으로, 현 거주 지역을 방문 목록에.
update characters c
set residence_since = coalesce(c.residence_since, c.created_at),
    active_profile_since = coalesce(c.active_profile_since, c.created_at);

update characters c
set visited_regions = jsonb_build_array(z.region::text)
from zones z
where z.id = c.residence_zone_id and c.visited_regions = '[]'::jsonb;
