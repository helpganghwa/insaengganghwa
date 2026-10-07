-- 0229: 우편 종류 'world_boss'(2026-10-07, docs/WORLD-BOSS.md) — 원정대 보상·길드 결과 우편.
-- ADD VALUE는 트랜잭션 밖에서 실행해야 하므로 단일 문장(0087과 같은 방식). 0228과 순서 무관.
alter type mailbox_type add value if not exists 'world_boss';
