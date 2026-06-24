import { notFound } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { getConquestBattleById } from '@/lib/game/guild';
import { buildConquestBattleView } from '@/lib/game/guild/conquest/battle-view';

import { ConquestBattleView } from './ConquestBattleView';

/**
 * /guild/battle/[id] — 점령전 상세 전투 기록(세계지도 구역 → "전투 기록" 진입).
 * 대난투 배틀 페이지와 동일한 톤의 상세 리플레이(라운드 로그·길드 대진·생존/킬). 공개 읽기.
 */
export default async function ConquestBattlePage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const row = await getConquestBattleById(BigInt(id)).catch(() => null);
  if (!row) notFound();

  const serverId = await getActiveServerId();
  const view = await buildConquestBattleView(row, userId);
  return <ConquestBattleView view={view} serverId={serverId} />;
}
