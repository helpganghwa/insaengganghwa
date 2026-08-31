import { ServerClockSync } from '@/components/ServerClockSync';
import type { Metadata } from 'next';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { ensureOffers } from '@/lib/game/expedition/service';
import { getExpeditionBoard } from '@/lib/game/expedition/queries';

import { ExpeditionBoardView } from './ExpeditionBoard';

export const metadata: Metadata = { title: '파견 — 인생강화' };
export const dynamic = 'force-dynamic';

/** 파견 홈 — 오퍼 보정(lazy) 후 보드 렌더. 인증은 (game) 레이아웃이 보장. */
export default async function ExpeditionPage() {
  const userId = (await getSessionUserId())!;
  const serverId = await getActiveServerId();
  await ensureOffers(userId, serverId);
  const board = await getExpeditionBoard(userId, serverId);
  return (
    <main className="flex-1 overflow-y-auto px-3 pt-2 pb-6">
      <ServerClockSync nowIso={new Date().toISOString()} />
      <ExpeditionBoardView initial={board} />
    </main>
  );
}
