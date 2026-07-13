-- 0115: 길드 문양 재생성 에스크로 (2026-07-13)
-- 유료 재생성(3,000💎)의 다이아 손실/혼란 방지. 클릭 즉시 예치(차감)·pending 기록 →
-- 성공 completed / 실패 환불+우편 후 refunded. 예치~해소 사이 함수 사망 시 pending 잔존 →
-- reconcile 크론이 6분(>maxDuration 180s) 경과분 환불. 멱등(IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS guild_emblem_escrows (
  id          bigserial PRIMARY KEY,
  server_id   smallint NOT NULL DEFAULT 1,
  guild_id    bigint NOT NULL,
  user_id     uuid NOT NULL,
  amount      bigint NOT NULL,
  status      text NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- reconcile 대상(미해소 예치) 빠른 조회 — 부분 인덱스.
CREATE INDEX IF NOT EXISTS guild_emblem_escrow_pending_idx
  ON guild_emblem_escrows (created_at)
  WHERE status = 'pending';
