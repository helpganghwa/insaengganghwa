import { notFound, redirect } from 'next/navigation';

import { getActiveServerId } from '@/lib/game/servers';
import { worldBossIdOfParty } from '@/lib/game/world-boss/queries';

/** 푸시 딥링크(/world-boss/party/<원정대 id>) → 그 보스 상세. 원정대 패널은 상세 안에 핀으로 뜬다. */
export default async function WorldBossPartyRedirect({ params }: { params: Promise<{ partyId: string }> }) {
  const { partyId } = await params;
  const bossId = await worldBossIdOfParty(partyId, await getActiveServerId()).catch(() => null);
  if (!bossId) notFound();
  redirect(`/world-boss/${bossId}`);
}
