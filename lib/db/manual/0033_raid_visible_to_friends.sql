-- 0033 레이드 친구 공개 플래그. 멱등. 실행: bun run scripts/_apply-0033.ts
-- true = 친구 목록(/raid '친구가 소환한 레이드')에 노출. 기본 false(비공개, 링크로만 참가).
ALTER TABLE raids ADD COLUMN IF NOT EXISTS visible_to_friends boolean NOT NULL DEFAULT false;
-- 친구 공개 활성 레이드 조회용.
CREATE INDEX IF NOT EXISTS raid_visible_friends_idx ON raids (visible_to_friends, status, expire_at);
