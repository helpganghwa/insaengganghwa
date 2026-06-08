-- 0035 기존 대난투 우편에 battleId 백필 → 트로피 아바타 연결. 멱등(이미 있으면 skip).
-- 매칭: senderLabel='대난투' 메일의 (user_id, KST 발급일) = 그 유저가 참가한 그날 배틀.
UPDATE mailbox m
SET payload = jsonb_set(m.payload, '{battleId}', to_jsonb(b.id::text), true)
FROM melee_battles b
JOIN melee_participants mp ON mp.battle_id = b.id
WHERE m.sender_label = '대난투'
  AND mp.user_id = m.user_id
  AND b.battle_date = (m.created_at AT TIME ZONE 'Asia/Seoul')::date
  AND NOT (m.payload ? 'battleId');
