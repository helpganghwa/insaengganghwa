-- 0163: 칭호 판정 멘션 지표 GIN 인덱스(2026-08-21, 칭호 감사 M5)
--
-- 배경: 칭호 화면 진입 lazy 판정(judge.ts collectMetrics)의 mentions_got 지표가
-- chat_messages.mentions에 jsonb @> 컨테인먼트를 거는데 받쳐줄 인덱스가 없어 서버 채팅
-- 전체를 순차 스캔한다. 채팅은 무한 누적 테이블이라 시간이 갈수록 판정이 선형으로
-- 느려진다(5초 타임아웃행).
--
-- chats·night_chats(user_id 필터)는 기존 chat_messages_user_id_idx(0162)가 이미 받친다 —
-- (server_id, user_id) 복합은 중복이라 만들지 않는다(핫 insert 경로 쓰기 비용).
--
-- ⚠ CONCURRENTLY — 트랜잭션 밖에서 한 문장씩 실행할 것(psql/스크립트).
create index concurrently if not exists chat_msg_mentions_gin
  on chat_messages using gin (mentions jsonb_path_ops);
