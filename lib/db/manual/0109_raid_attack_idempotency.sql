-- 0109: 레이드 유료 공격 멱등키 (2026-07-07 전수감사 B-묶음, CLAUDE §3.4)
--
-- 응답 유실 후 재클릭이 다이아를 이중 차감하던 구멍: 클라가 클릭 의도당 UUID 키를
-- 생성해 전달하고, 서버는 같은 키의 재시도에 저장된 결과를 반환한다(재차감 없음).
-- ① 보석 공격(gemAttackRaid): raid_attacks 행에 키 저장 — 재시도는 그 행을 돌려준다.
alter table raid_attacks add column if not exists idempotency_key uuid;
create unique index if not exists raid_attacks_idem_uq
  on raid_attacks (idempotency_key) where idempotency_key is not null;
-- ② 추가 공격 충전(buyExtraAttack): 공격 행이 없어 참가자 행에 최근 구매 키 저장 —
--    같은 유저의 재시도(직전 키 일치)만 걸러내면 충분(클릭마다 새 키).
alter table raid_participants add column if not exists last_buy_key uuid;
