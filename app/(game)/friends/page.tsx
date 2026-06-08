import { getSessionUserId } from '@/lib/auth/session';
import { withTimeout } from '@/lib/db/with-timeout';
import { getFriends, getRequests, type FriendUser } from '@/lib/game/friends';

import { FriendsTabs } from './FriendsTabs';

/**
 * 친구 — 검색→요청→수락(선물 없음). 진입: 프로필(/me) '친구' 버튼.
 * 탭: 목록 / 요청(받은·보낸) / 찾기. 콜드 hang 시 빈 결과로 degrade.
 */
export default async function FriendsPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const empty = { incoming: [] as FriendUser[], outgoing: [] as FriendUser[] };
  const [friends, requests] = await Promise.all([
    withTimeout(getFriends(userId), 3500, 'friends.list').catch(() => [] as FriendUser[]),
    withTimeout(getRequests(userId), 3500, 'friends.requests').catch(() => empty),
  ]);

  return <FriendsTabs friends={friends} incoming={requests.incoming} outgoing={requests.outgoing} />;
}
