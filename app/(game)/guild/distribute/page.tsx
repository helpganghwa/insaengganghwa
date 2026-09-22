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
 * 2026-09-20 권한 분리 — 가진 권한의 탭만 보인다. 없는 쪽은 데이터도 읽지 않고 내려보내지 않는다.
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
  // 수금(taxCollect)과 분배(taxDistribute)는 따로 주는 권한이다(2026-09-20 분리) — 둘 중 하나라도 있으면 들어온다.
  // 실제 수금·분배는 서버가 각 권한으로 다시 검사한다(collect.ts · distribute.ts).
  const canCollect = hasGuildPerm(membership.role, membership.permissions, 'taxCollect');
  const canDistribute = hasGuildPerm(membership.role, membership.permissions, 'taxDistribute');
  if (!canCollect && !canDistribute) {
    redirect('/guild/settings');
  }

  const [guild, members, collect, sp] = await Promise.all([
    getGuild(membership.guildId),
    canDistribute ? getDistributeMembers(membership.guildId) : Promise.resolve([]),
    canCollect ? getTaxCollectView(membership.guildId, serverId) : Promise.resolve(null),
    searchParams,
  ]);
  if (!guild) redirect('/guild');
  // 주소의 탭이 권한 없는 쪽이면 가진 쪽으로 돌린다.
  const wanted: TaxTab = sp.tab === 'distribute' ? 'distribute' : 'collect';
  const initialTab: TaxTab = wanted === 'collect' ? (canCollect ? 'collect' : 'distribute') : canDistribute ? 'distribute' : 'collect';
  const title = canCollect && canDistribute ? '세금 수금·분배' : canCollect ? '세금 수금' : '세금 분배';

  return (
    <div className="px-4 pb-4 pt-3">
      <GuildPageHeader fallback="/guild/settings" kicker={guild.name} title={title} />
      <TaxBoard
        myUserId={userId}
        initialTab={initialTab}
        collect={collect}
        pool={canDistribute ? guild.taxPoolDiamond.toString() : '0'}
        members={members}
        canDistribute={canDistribute}
      />
    </div>
  );
}
