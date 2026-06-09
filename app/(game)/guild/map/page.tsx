import { assetUrl } from '@/lib/asset-versions';
import { getSessionUserId } from '@/lib/auth/session';
import {
  getWorldmapZones,
  getMyMembership,
  getResidence,
  getMyDeployment,
  getMyGuildDeployments,
  nextBattleKstDay,
} from '@/lib/game/guild';
import { kstDateString } from '@/lib/kst';

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

  // 점령전 배치 상태(길드원만): 내 배치 + 자기 길드 배치(안개 — 자기 길드만).
  const [myDeployment, guildDeploys] = await Promise.all([
    userId && membership ? getMyDeployment(userId) : Promise.resolve(null),
    membership ? getMyGuildDeployments(membership.guildId) : Promise.resolve([]),
  ]);
  const battleDayLabel = nextBattleKstDay() === kstDateString() ? '오늘 12:00' : '내일 12:00';

  return (
    <WorldMapView
      mapSrc={assetUrl('/sprites/guild/worldmap.png')}
      myGuildId={myGuildId}
      residenceZoneId={residenceZoneId}
      canSetResidence={userId != null}
      battleDayLabel={battleDayLabel}
      myDeployment={myDeployment ? { zoneId: myDeployment.zoneId, role: myDeployment.role } : null}
      guildDeploys={guildDeploys.map((d) => ({ zoneId: d.zoneId, role: d.role as 'attack' | 'defend' }))}
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
