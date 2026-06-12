import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { meleeBattles } from '@/lib/db/schema/melee';
import { buildMeleeResultView } from '@/lib/game/melee/result-view';

import { MeleeResult } from '../../MeleeResult';

/**
 * /melee/battle/[id] — 과거 회차 결과(역대 우승자에서 진입). 발표된 배틀만 노출.
 * 오늘/과거 동일 빌더(buildMeleeResultView) 사용 — 무대·랭킹·내 순위·로그 동일.
 */
export default async function MeleeBattlePage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const [battle] = await withTimeout(
    db
      .select({
        id: meleeBattles.id,
        battleDate: meleeBattles.battleDate,
        status: meleeBattles.status,
        serverId: meleeBattles.serverId,
        participantCount: meleeBattles.participantCount,
        totalRounds: meleeBattles.totalRounds,
        championUserId: meleeBattles.championUserId,
        finale: meleeBattles.finale,
      })
      .from(meleeBattles)
      .where(eq(meleeBattles.id, BigInt(id)))
      .limit(1),
    3000,
    'melee.battle.byId',
  ).catch(() => []);

  if (!battle || battle.status !== 'revealed') notFound();

  const view = await buildMeleeResultView(battle, userId);
  return <MeleeResult view={view} />;
}
