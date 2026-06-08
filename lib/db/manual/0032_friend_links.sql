-- 0032 친구(friend_links) — 검색→요청→수락. 멱등. 실행: bun run scripts/_apply-0032.ts
-- status: 'pending'(요청 중) | 'accepted'(친구). 친구 = accepted & (requester or addressee = 나).
CREATE TABLE IF NOT EXISTS friend_links (
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_id, addressee_id),
  CONSTRAINT friend_no_self CHECK (requester_id <> addressee_id)
);
-- 받은 요청·친구 목록 조회용.
CREATE INDEX IF NOT EXISTS friend_addressee_idx ON friend_links (addressee_id, status);
CREATE INDEX IF NOT EXISTS friend_requester_idx ON friend_links (requester_id, status);
