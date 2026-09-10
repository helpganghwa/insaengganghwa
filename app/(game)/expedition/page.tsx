import { ServerClockSync } from '@/components/ServerClockSync';
import type { Metadata } from 'next';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { ensureOffers } from '@/lib/game/expedition/service';
import { getExpeditionBoard } from '@/lib/game/expedition/queries';

import { ExpeditionBoardView } from './ExpeditionBoard';

export const metadata: Metadata = { title: '파견 — 인생강화' };
export const dynamic = 'force-dynamic';

/**
 * 파견 홈 — 오퍼 보정(lazy) 후 보드 렌더. 인증은 (game) 레이아웃이 보장.
 * ⚠ 세션이 만료된 찰나에 이 페이지가 렌더되면 userId가 없다 — 예전엔 `!`로 넘겨 빈 문자열이
 * `${userId}::uuid`에 들어가 렌더가 통째로 터졌다(2026-08-31~09-09 프로덕션 11회, /expedition 전용 사고).
 * 다른 페이지(raid 등)와 같이 조용히 비우고 레이아웃 게이트가 로그인으로 보내게 한다.
 */
export default async function ExpeditionPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) return null;
  await ensureOffers(userId, serverId);
  const board = await getExpeditionBoard(userId, serverId);
  return (
    <main className="flex-1 overflow-y-auto px-3 pt-2 pb-6">
      <ServerClockSync nowIso={new Date().toISOString()} />
      <ExpeditionBoardView initial={board} />
    </main>
  );
}
