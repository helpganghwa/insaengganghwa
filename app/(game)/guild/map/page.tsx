import { assetUrl } from '@/lib/asset-versions';
import { getActiveServerId } from '@/lib/game/servers';
import { getSessionUserId } from '@/lib/auth/session';
import { getWorldmapZones, getResidence, getChronicle, getZoneAdjacency } from '@/lib/game/guild';

import { WorldMapView } from './WorldMapView';

export const dynamic = 'force-dynamic';

export default async function WorldMapPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();

  const [zones, residenceZoneId, chronicle, adjacency] = await Promise.all([
    getWorldmapZones(serverId),
    userId ? getResidence(userId, serverId) : Promise.resolve(null),
    getChronicle(serverId).catch(() => null),
    getZoneAdjacency(serverId).catch(() => []),
  ]);

  return (
    <WorldMapView
      mapSrc={assetUrl('/sprites/guild/worldmap.png')}
      residenceZoneId={residenceZoneId}
      canSetResidence={userId != null}
      myUserId={userId}
      chronicle={chronicle}
      adjacency={adjacency}
      zones={zones.map((z) => ({
        id: z.id,
        region: z.region,
        name: z.name,
        mapX: z.mapX,
        mapY: z.mapY,
        locked: z.locked,
        ownerGuildId: z.ownerGuildId?.toString() ?? null,
        ownerGuildName: z.ownerGuildName,
        ownerEmblemUrl: z.ownerEmblemUrl,
        executorUserId: z.executorUserId,
        executorNickname: z.executorNickname,
        taxDiamond: z.taxDiamond.toString(),
        lastTaxAt: z.lastTaxCollectedAt ? z.lastTaxCollectedAt.getTime() : null,
        residentCount: z.residentCount,
      }))}
    />
  );
}
