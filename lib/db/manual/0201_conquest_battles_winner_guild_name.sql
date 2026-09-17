-- 0201 (2026-09-17) 점령전 전투의 승자 길드 이름 스냅샷.
-- winner_guild_id는 guilds FK(on delete set null)라 길드가 해산하면 비워져, 그 길드의 점령이 무승부처럼 읽힌다
-- (역사 페이지 1일차 강화맛집·대장장이 점령 애니메이션 누락 제보). 앞으로는 저장 시 이름을 함께 박제하고,
-- 이미 비워진 행은 감사 로그(zone_capture, 자정 공개 시각)와 연대기 스냅샷(guild_refs)으로 복원한다.
alter table conquest_battles add column if not exists winner_guild_name text;

-- 1) 승자 id가 살아 있는 행: 그날 스냅샷 이름 → 없으면 현재 이름.
update conquest_battles cb set winner_guild_name = coalesce(
  (select r->>'name' from world_chronicle wc, jsonb_array_elements(wc.guild_refs) r
    where wc.server_id = cb.server_id and wc.kst_day = cb.battle_kst_day and (r->>'id')::bigint = cb.winner_guild_id limit 1),
  (select g.name from guilds g where g.id = cb.winner_guild_id))
where cb.winner_guild_id is not null and cb.winner_guild_name is null;

-- 2) 해산으로 비워진 행: 그 자정 공개 시각의 zone_capture 감사 로그(길드 id는 FK가 아니라 남아 있음) → 가장 가까운 날 스냅샷 이름.
--    감사 로그가 없는 행(무승부·방어)은 그대로 둔다.
update conquest_battles cb set winner_guild_name = sub.name from (
  select cb.id,
    (select r->>'name' from world_chronicle wc, jsonb_array_elements(wc.guild_refs) r
      where wc.server_id = cb.server_id and (r->>'id')::bigint = a.guild_id
      order by abs(wc.kst_day - cb.battle_kst_day) limit 1) as name
  from conquest_battles cb join zones z on z.id = cb.zone_id
  join lateral (
    select a.guild_id from guild_audit_log a
    where a.server_id = cb.server_id and a.action = 'zone_capture' and a.detail->>'zone' = z.name
      and a.created_at >= ((cb.battle_kst_day + 1)::timestamp at time zone 'Asia/Seoul') - interval '1 hour'
      and a.created_at <  ((cb.battle_kst_day + 1)::timestamp at time zone 'Asia/Seoul') + interval '3 hours'
    order by a.created_at limit 1) a on true
  where cb.winner_guild_id is null and cb.winner_guild_name is null
) sub where sub.id = cb.id and sub.name is not null;
