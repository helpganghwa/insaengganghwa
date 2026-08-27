-- 0178 파견 성장축 ③ — 아바타 강화 합 배율 (EXPEDITION §3.3, 2026-08-27)
-- 배율 = 배정 아바타의 강화 합(생성에 쓴 장비 3종의 현재 enhance_level 합) 곡선 M(AS). 시작 시 시너지·레벨과
-- 함께 req_bonus_bp로 스냅샷한다(final_reward 산출 근거 보존 — 분쟁 조사). 권장/최소 강화 합은 도입하지 않는다
-- (설계 과정에서 required_sum을 잠시 추가했다가 같은 날 폐기 — 멱등 정리).

alter table expeditions add column if not exists req_bonus_bp integer not null default 0;
alter table expeditions drop column if exists required_sum;
