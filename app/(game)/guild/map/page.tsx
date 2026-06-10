import { assetUrl } from '@/lib/asset-versions';
import { getSessionUserId } from '@/lib/auth/session';
import {
  getWorldmapZones,
  getMyMembership,
  getResidence,
  getMyGuildDeployments,
  getChronicle,
} from '@/lib/game/guild';

import { WorldMapView } from './WorldMapView';

export const dynamic = 'force-dynamic';

export default async function WorldMapPage() {
  const userId = await getSessionUserId();

  const [zones, membership, residenceZoneId, chronicle] = await Promise.all([
    getWorldmapZones(),
    userId ? getMyMembership(userId) : Promise.resolve(null),
    userId ? getResidence(userId) : Promise.resolve(null),
    getChronicle().catch(() => null),
  ]);

  const myGuildId = membership?.guildId.toString() ?? null;

  // 자기 길드 배치 안개(자기 길드만 열람 — 세계지도는 거주 이동 외 조회 전용).
  const guildDeploys = membership ? await getMyGuildDeployments(membership.guildId) : [];

  return (
    <WorldMapView
      mapSrc={assetUrl('/sprites/guild/worldmap.png')}
      myGuildId={myGuildId}
      residenceZoneId={residenceZoneId}
      canSetResidence={userId != null}
      chronicle={chronicle}
      guildDeploys={guildDeploys.map((d) => ({ zoneId: d.zoneId, role: d.role as 'attack' | 'defend' }))}
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
