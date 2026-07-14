-- 0118: 도전 과제(일회성 온보딩 리워드) (2026-07-14)
-- 대부분 과제는 기존 테이블 상태 파생으로 달성 판정. 상태 흔적이 없는 행위 4종
-- (앱 실행·자랑 공유·거주 이동·아바타 변경)만 challenge_events에 마킹.
-- 수령은 challenge_claims (유저·서버·과제당 1회 UNIQUE = 멱등). 멱등(IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS challenge_events (
  user_id    uuid NOT NULL,
  server_id  smallint NOT NULL,
  event_id   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, server_id, event_id)
);

CREATE TABLE IF NOT EXISTS challenge_claims (
  user_id    uuid NOT NULL,
  server_id  smallint NOT NULL,
  challenge_id text NOT NULL,
  -- 지급 스냅샷(감사) — 수령 시점 보상. 정의 변경돼도 이력 보존.
  diamond    bigint NOT NULL DEFAULT 0,
  boxes      jsonb NOT NULL DEFAULT '{}'::jsonb,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, server_id, challenge_id)
);
