-- 0237 대원별 공격 보상(💎·📦)을 대원 행에 기록한다(10-11 사용자 결정): 내 원정대(종료) 화면이 전투 기록(finale jsonb, 5~8KB)을 다시 읽지 않게.
alter table world_boss_party_members add column if not exists diamond integer not null default 0;
alter table world_boss_party_members add column if not exists boxes integer not null default 0;
-- 백필: 출발한 원정대의 기록(finale.events·drops·roster)에서 대원별 합을 센다. 다시 실행해도 같은 값이라 안전하다.
with ev as (
  select p.id as pid, p.finale, (e.value->>0)::int as a, coalesce((d.value->>0)::int, 0) as dia, coalesce((d.value->>1)::int, 0) as box
    from world_boss_parties p
    cross join jsonb_array_elements(p.finale->'events') with ordinality e(value, k)
    left join jsonb_array_elements(p.finale->'drops') with ordinality d(value, k) on d.k = e.k
   where p.status = 'departed' and p.finale is not null
), agg as (
  select pid, (finale->'roster'->a->>'userId')::uuid as uid, sum(dia)::int as dia, sum(box)::int as box
    from ev where a >= 0 group by pid, (finale->'roster'->a->>'userId')
)
update world_boss_party_members m set diamond = agg.dia, boxes = agg.box
  from agg where m.party_id = agg.pid and m.user_id = agg.uid;
