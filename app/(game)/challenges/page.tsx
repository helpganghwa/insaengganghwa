import { getSessionUserId, shouldHidePaidContent } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getChallengeStatus } from '@/lib/game/challenges/status';

import { ChallengesClient } from './ChallengesClient';

/**
 * 도전 과제 — 일회성 온보딩 리워드(0118). 달성 판정은 상태 파생 단일 SQL(status.ts),
 * 수령·연출은 클라(ChallengesClient). 상점 무료 3종은 CBT 동안 자동 숨김.
 */
export const dynamic = 'force-dynamic';

export default async function ChallengesPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const serverId = await getActiveServerId();
  const hidePaid = await shouldHidePaidContent();

  const status = await withTimeout(
    getChallengeStatus(userId, serverId, hidePaid),
    3500,
    'challenges.status',
  ).catch(() => null);

  if (!status) {
    return (
      <p className="px-4 py-10 text-center text-sm text-zinc-500">
        잠시 후 다시 시도해 주세요.
      </p>
    );
  }

  return (
    <ChallengesClient
      done={status.done}
      claimedInit={[...status.claimed]}
      completeClaimed={status.completeClaimed}
      hidePaid={hidePaid}
    />
  );
}
