-- 친구 무방향 쌍 유니크(2026-07-06).
-- friend_links의 PK는 방향성(requester_id, server_id, addressee_id)이라 A→B와 B→A가 서로 다른
-- 행으로 공존할 수 있다. 상호 동시 요청(정확히 같은 순간 서로 요청) 시 둘 다 pending으로 insert되어
-- 이후 각자 수락하면 한 쌍에 accepted 2행 → 친구 중복 노출·30명 캡 이중 소진.
-- 정렬 쌍(least,greatest) 유니크로 서버당 한 쌍 1행을 강제(sendRequest의 advisory 락과 이중 방어).
CREATE UNIQUE INDEX IF NOT EXISTS friend_pair_uq ON friend_links (
  server_id,
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);
