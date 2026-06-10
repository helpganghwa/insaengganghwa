import { assetUrl } from '@/lib/asset-versions';
import { getSessionUserId } from '@/lib/auth/session';
import { getWorldmapZones, getResidence, getChronicle } from '@/lib/game/guild';

import { WorldMapView } from './WorldMapView';

export const dynamic = 'force-dynamic';

export default async function WorldMapPage() {
  const userId = await getSessionUserId();

  const [zones, residenceZoneId, chronicle] = await Promise.all([
    getWorldmapZones(),
    userId ? getResidence(userId) : Promise.resolve(null),
    getChronicle().catch(() => null),
  ]);

  return (
    <WorldMapView
      mapSrc={assetUrl('/sprites/guild/worldmap.png')}
      residenceZoneId={residenceZoneId}
      canSetResidence={userId != null}
      chronicle={chronicle}
      zones={zones.map((z) => ({
        id: z.id,
        region: z.region,
        name: z.name,
        mapX: z.mapX,
        mapY: z.mapY,
        ownerGuildId: z.ownerGuildId?.toString() ?? null,
        ownerGuildName: z.ownerGuildName,
        ownerEmblemUrl: z.ownerEmblemUrl,
        executorUserId: z.executorUserId,
        executorNickname: z.executorNickname,
        taxDiamond: z.taxDiamond.toString(),
        residentCount: z.residentCount,
      }))}
    />
  );
}
