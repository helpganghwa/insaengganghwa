-- 0094: user_equipment 슬롯당 1개 부분 UNIQUE (더블 장착 레이스 방어)
--
-- 무엇: (user_id, server_id, equipped_slot) partial UNIQUE 인덱스 추가.
-- 왜: equip.ts는 "슬롯당 1개(부분 UNIQUE)"를 전제로 기존 장착 해제 후 교체하지만,
--     실제 인덱스는 non-unique(ue_user_slot_idx)였다. 동시 장착 2건이 각자 자기 행만
--     FOR UPDATE로 잠그면 서로의 미커밋 상태를 못 봐 같은 슬롯에 2개가 커밋될 수 있다
--     (인벤토리 "장착 중" 표시·공유카드 슬롯 선택 무결성 깨짐). UNIQUE로 격상해 DB가
--     최후 방어(중복 커밋 = unique violation → equip.ts에서 SLOT_TAKEN 처리).
-- 멱등: 재적용 안전(IF NOT EXISTS + 사전 중복 정리).
-- 적용: bun run scripts/apply-migration.ts (스크립트가 BEGIN/COMMIT으로 감쌈).

-- 기존 중복(과거 레이스로 생겼을 수 있음) 정리 — 슬롯당 최근 획득 1개만 유지, 나머지 해제.
with ranked as (
  select id, row_number() over (
    partition by user_id, server_id, equipped_slot
    order by first_acquired_at desc, id desc
  ) as rn
  from public.user_equipment
  where equipped_slot is not null
)
update public.user_equipment ue
set equipped_slot = null
from ranked r
where ue.id = r.id and r.rn > 1;

create unique index if not exists ue_user_slot_uq
  on public.user_equipment(user_id, server_id, equipped_slot)
  where equipped_slot is not null;
