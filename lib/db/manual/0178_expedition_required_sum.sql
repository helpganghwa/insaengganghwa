-- 0178 파견 성장축 ③ — 필요 강화 합 (EXPEDITION §3.3, 2026-08-27)
-- 미션마다 시간과 독립으로 "필요 강화 합"(required_sum)을 롤한다. 배정 아바타의 강화 합(생성에 쓴
-- 장비 3종의 현재 enhance_level 합)이 이 값 이상이어야 시작 가능. 시작 시 배율(req_bonus_bp)을
-- 시너지·레벨과 함께 스냅샷한다(final_reward 산출 근거 보존 — 분쟁 조사).

alter table expeditions add column if not exists required_sum integer not null default 0;
alter table expeditions add column if not exists req_bonus_bp integer not null default 0;
