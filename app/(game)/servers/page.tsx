import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { listServersForUser, countServers } from '@/lib/game/server-select';

import { ServerList } from './ServerList';

export const dynamic = 'force-dynamic';

/**
 * 서버 선택(SERVER.md §3) — 캐릭터 보유 서버는 입장, 미보유는 캐릭터 생성.
 * 단일 서버 운영 중에는 진입 의미가 없어 홈으로 돌려보낸다(설정의 진입점도 2서버+에서만 노출).
 */
export default async function ServersPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');
  if ((await countServers()) <= 1) redirect('/');

  const [servers, activeId] = await Promise.all([listServersForUser(userId), getActiveServerId()]);
  return <ServerList servers={servers} activeId={activeId} />;
}
