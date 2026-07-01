import { redirect } from 'next/navigation';
import { getActiveServerId } from '@/lib/game/servers';

import { getSessionUserId } from '@/lib/auth/session';
import { assetUrl } from '@/lib/asset-versions';
import {
  getMyMembership,
  getDeployBoard,
  getAttackableZoneIds,
  getZoneAdjacency,
} from '@/lib/game/guild';
import { DeployBoard } from './DeployBoard';

export const dynamic = 'force-dynamic';

export default async function DeployPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const membership = await getMyMembership(userId, serverId);
  if (!membership) redirect('/guild');

  const isOfficer = membership.role === 'leader' || membership.role === 'vice';
  const [board, attackable, adjacency] = await Promise.all([
    getDeployBoard(membership.guildId),
    getAttackableZoneIds(membership.guildId),
    getZoneAdjacency(serverId),
  ]);

  return (
    <DeployBoard
      isOfficer={isOfficer}
      myUserId={userId}
      myGuildId={membership.guildId.toString()}
      mapSrc={assetUrl('/sprites/guild/worldmap.png')}
      attackableZoneIds={attackable}
      adjacency={adjacency}
      members={board.members.map((m) => ({
        userId: m.uid,
        nickname: m.nickname,
        role: m.mrole,
        combat: board.combat[m.uid] ?? 0,
        depZoneId: m.dep_zone_id,
        depZoneName: m.dep_zone_name,
        depRole: m.dep_role,
        execZoneId: m.exec_zone_id,
        execZoneName: m.exec_zone_name,
      }))}
      zones={board.zones.map((z) => ({
        id: z.id,
        name: z.name,
        region: z.region,
        mapX: z.mapX,
        mapY: z.mapY,
        ownerGuildId: z.ownerGuildId?.toString() ?? null,
        ownerEmblemUrl: z.ownerEmblemUrl,
      }))}
    />
  );
}
