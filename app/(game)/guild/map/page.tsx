import { assetUrl } from '@/lib/asset-versions';
import { getSessionUserId } from '@/lib/auth/session';
import { getWorldmapZones, getMyMembership, getResidence } from '@/lib/game/guild';

import { WorldMapView } from './WorldMapView';

export const dynamic = 'force-dynamic';

export default async function WorldMapPage() {
  const userId = await getSessionUserId();

  const [zones, membership, residenceZoneId] = await Promise.all([
    getWorldmapZones(),
    userId ? getMyMembership(userId) : Promise.resolve(null),
    userId ? getResidence(userId) : Promise.resolve(null),
  ]);

  const myGuildId = membership?.guildId.toString() ?? null;

  return (
    <WorldMapView
      mapSrc={assetUrl('/sprites/guild/worldmap.png')}
      myGuildId={myGuildId}
      residenceZoneId={residenceZoneId}
      canSetResidence={userId != null}
      zones={zones.map((z) => ({
        id: z.id,
        region: z.region,
        name: z.name,
        mapX: z.mapX,
        mapY: z.mapY,
        ownerGuildId: z.ownerGuildId?.toString() ?? null,
        ownerGuildName: z.ownerGuildName,
        lordNickname: z.lordNickname,
        taxDiamond: z.taxDiamond.toString(),
      }))}
    />
  );
}
