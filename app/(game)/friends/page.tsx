import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getFriends, getRequests, type FriendUser } from '@/lib/game/friends';
import { getGuildBriefsByUsers } from '@/lib/game/guild';

import { FriendsTabs } from './FriendsTabs';

/**
 * 친구 — 검색→요청→수락(선물 없음). 진입: 프로필(/me) '친구' 버튼.
 * 탭: 목록 / 요청(받은·보낸) / 찾기. 콜드 hang 시 빈 결과로 degrade.
 */
export default async function FriendsPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const serverId = await getActiveServerId();

  const empty = { incoming: [] as FriendUser[], outgoing: [] as FriendUser[] };
  const [friends, requests] = await Promise.all([
    withTimeout(getFriends(userId, serverId), 3500, 'friends.list').catch(() => [] as FriendUser[]),
    withTimeout(getRequests(userId, serverId), 3500, 'friends.requests').catch(() => empty),
  ]);

  // 길드 문양 일괄 부착(목록·받은·보낸 전체 1쿼리). 실패해도 목록은 표시.
  const ids = [...friends, ...requests.incoming, ...requests.outgoing].map((u) => u.userId);
  const guildMap = await getGuildBriefsByUsers(ids).catch(
    () => new Map<string, { emblemUrl: string | null; name: string }>(),
  );
  const attach = (u: FriendUser): FriendUser => ({
    ...u,
    guildEmblemUrl: guildMap.get(u.userId)?.emblemUrl ?? null,
    guildName: guildMap.get(u.userId)?.name ?? null,
  });

  return (
    <FriendsTabs
      friends={friends.map(attach)}
      incoming={requests.incoming.map(attach)}
      outgoing={requests.outgoing.map(attach)}
    />
  );
}
