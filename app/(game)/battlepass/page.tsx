import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getBattlePassView } from '@/lib/game/battlepass';

import { BattlePassClient } from './BattlePassClient';

/**
 * 배틀패스 — BALANCE §9 / SCHEMA §14. 성장 패스(만료 없음). 강화/초월 2종.
 * 진행도 = 계정 최고 도달. 무료 라인 전 구간 수령 + 프리미엄 구간별(결제 준비 중).
 */
export default async function BattlePassPage({
  searchParams,
}: {
  searchParams: Promise<{ paymentId?: string; code?: string }>;
}) {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) return null;
  const sp = await searchParams;

  const data = await withTimeout(
    Promise.all([
      getBattlePassView(userId, serverId, 'enhance'),
      getBattlePassView(userId, serverId, 'transcend'),
    ]),
    3500,
    'battlepass.page',
  ).catch(() => null);

  if (!data) {
    return (
      <div className="px-4 py-8 text-center text-sm text-zinc-500">
        잠시 후 다시 시도해 주세요.
      </div>
    );
  }

  return (
    <BattlePassClient
      enhance={data[0]}
      transcend={data[1]}
      returnPaymentId={sp.paymentId ?? null}
      returnCode={sp.code ?? null}
    />
  );
}
