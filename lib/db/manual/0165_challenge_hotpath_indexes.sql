-- 0165: 도전과제·판정 핫패스 user_id 인덱스 6종(2026-08-21, 전수 감사 ⑦-2)
--
-- 배경: 홈 진입마다 도는 도전과제 EXISTS 판정(+칭호 판정 일부)이 아래 테이블들을
-- user_id로 거르는데 선두 컬럼이 user_id인 인덱스가 없어 append-only 누적과 함께
-- 선형으로 느려진다. 지금은 컷오버 직후라 테이블이 비어 생성이 즉시 끝난다.
--
-- ⚠ CONCURRENTLY — 트랜잭션 밖에서 한 문장씩 실행할 것.
create index concurrently if not exists transcend_logs_user_idx
  on transcend_logs (user_id, server_id);
create index concurrently if not exists gem_time_reductions_user_idx
  on gem_time_reductions (user_id, server_id);
create index concurrently if not exists raid_attacks_user_idx
  on raid_attacks (user_id);
create index concurrently if not exists raids_host_idx
  on raids (host_user_id, server_id);
create index concurrently if not exists raid_rewards_user_claimed_idx
  on raid_rewards (user_id) where claimed_at is not null;
create index concurrently if not exists guild_battle_deployments_user_idx
  on guild_battle_deployments (user_id, server_id);
