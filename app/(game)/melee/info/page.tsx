import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { loadMeleeHistory } from '@/lib/game/melee/history';

import { MeleeInfo } from '../MeleeInfo';

/**
 * /melee/info — 대난투 정보(보상 테이블 + 역대 우승자). MELEE §6.
 * 역대 우승자 데이터는 loadMeleeHistory 공용 로더(대기/진행중 화면과 공유).
 */
export default async function MeleeInfoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const { tab } = await searchParams;
  const initialTab = tab === 'history' ? 'history' : 'reward';

  const history = await loadMeleeHistory(await getActiveServerId());
  return <MeleeInfo history={history} initialTab={initialTab} />;
}
