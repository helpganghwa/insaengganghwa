-- 0189: 레이드 난이도(2026-09-03 개편, BALANCE §5.4) — 쉬움/보통/어려움.
--  - raids.tier: 'easy'|'normal'|'hard'. 개설비·돌파 페이즈당 상자·마일스톤이 난이도별로 다르다.
--    HP 배수(×1/×8/×120)는 개설 시 phase1_hp에 곱해 저장하므로 페이즈 수식·돌파 판정은 그대로다.
--  - 기존 행은 'easy' — 개편 전 규칙(HP ×1·페이즈당 상자 1)과 같다. 이미 정산된 보상(raid_rewards.boxes)은
--    저장값을 쓰므로 소급되지 않는다.
begin;

alter table raids add column if not exists tier text not null default 'easy';

commit;
