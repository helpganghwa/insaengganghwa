-- 0192: 대난투 공격 성공·방어 성공 보상(2026-09-04, 유저 문의 다수) — 순위 운과 별개로 그날 잘 싸운 만큼 돌려준다.
--  melee_participants.reward_bonus_diamond: 처치 1회 MELEE_KILL_DIAMOND + 방어 성공 1회 MELEE_DEFENSE_DIAMOND의 합.
--  reward_diamond(우편 지급 총액)에 이미 합산되어 저장되며, 이 열은 결과 화면·우편 문구의 내역 표시용.
--  이전 배틀 행은 0(보너스 없던 시기) — 표시 안 함.
begin;
alter table melee_participants add column if not exists reward_bonus_diamond integer not null default 0;
commit;
