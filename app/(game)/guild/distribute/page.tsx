import { redirect } from 'next/navigation';
import { getActiveServerId } from '@/lib/game/servers';

import { getSessionUserId } from '@/lib/auth/session';
import { getGuild, getDistributeMembers, getTaxCollectView } from '@/lib/game/guild';
import { getGuildPermState } from '@/lib/game/guild/perm-guard';
import { hasGuildPerm } from '@/lib/game/guild/permissions';

import { GuildPageHeader } from '../GuildPageHeader';
import { TaxBoard, type TaxTab } from './TaxBoard';

export const dynamic = 'force-dynamic';

/**
 * 세금 수금·분배(2026-09-08) — 종전 '세금 분배' 화면에 **수금 탭**을 얹었다(S안).
 * `?tab=collect|distribute`로 바로 열 수 있다(기본 수금 — 걷고 나서 나누는 순서).
 */
export default async function DistributePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const membership = await getGuildPermState(userId, serverId);
  if (!membership) redirect('/guild');
  // 수금·분배 모두 taxDistribute 권한자(길드장 · 허용된 부길드장, 0142) — 별도 수금 권한은 두지 않는다.
  if (!hasGuildPerm(membership.role, membership.permissions, 'taxDistribute')) {
    redirect('/guild/settings');
  }

  const [guild, members, collect, sp] = await Promise.all([
    getGuild(membership.guildId),
    getDistributeMembers(membership.guildId),
    getTaxCollectView(membership.guildId, serverId),
    searchParams,
  ]);
  if (!guild) redirect('/guild');
  const initialTab: TaxTab = sp.tab === 'distribute' ? 'distribute' : 'collect';

  return (
    <div className="px-4 pb-4 pt-3">
      <GuildPageHeader fallback="/guild/settings" kicker={guild.name} title="세금 수금·분배" />
      <TaxBoard
        myUserId={userId}
        initialTab={initialTab}
        collect={collect}
        pool={guild.taxPoolDiamond.toString()}
        members={members}
      />
    </div>
  );
}
