-- 거주 이동 개편(2026-07-29) — 이동·거주 필수 / 인접 이동만 허용 / 이동 쿨타임 6시간.
-- 다음 이동 가능 시각을 캐릭터에 박는다(쿨다운 시작 시각이 아니라 **완료 시각**을 저장 —
-- 보석 단축이 이 값을 앞당기는 것만으로 끝나 강화 큐 단축과 같은 모양이 된다).
alter table characters add column if not exists residence_ready_at timestamptz;

-- 기존 배치자는 그 구역에 살고 있던 것으로 친다 — 규칙 적용 전에 등록된 배치라 거주가
-- 어긋날 수 있는데, 그대로 두면 "배치 중이라 이동 불가"에 걸린 채 배치 구역엔 살지 않는
-- 어정쩡한 상태가 된다. 다음 전투분(오늘/내일)만 대상.
update characters c
   set residence_zone_id = d.zone_id
  from guild_battle_deployments d
 where d.user_id = c.user_id
   and d.server_id = c.server_id
   and d.battle_kst_day >= (now() at time zone 'Asia/Seoul')::date
   and (c.residence_zone_id is distinct from d.zone_id);

-- 기존 집행관도 그 구역 거주자여야 한다(신규 규칙). 지금 다른 곳에 살고 있는 집행관을
-- 1회 정리 — 이 시점 이후로는 거주자만 집행관으로 지정된다.
update characters c
   set residence_zone_id = z.id
  from zones z
 where z.executor_user_id = c.user_id
   and z.server_id = c.server_id
   and (c.residence_zone_id is distinct from z.id);
