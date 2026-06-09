import { assetUrl } from '@/lib/asset-versions';
import { getSessionUserId } from '@/lib/auth/session';
import {
  getWorldmapZones,
  getMyMembership,
  getResidence,
  getMyGuildDeployments,
  getGuildMembers,
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
  const myRole = membership?.role ?? null;
  const isOfficer = myRole === 'leader' || myRole === 'vice';

  // 자기 길드 배치(안개 — 자기 길드만) + 집행관 지정용 길드원 목록(임원만).
  const [guildDeploys, members] = await Promise.all([
    membership ? getMyGuildDeployments(membership.guildId) : Promise.resolve([]),
    isOfficer && membership ? getGuildMembers(membership.guildId) : Promise.resolve([]),
  ]);
  const battleDayLabel = nextBattleKstDay() === kstDateString() ? '오늘 11:00' : '내일 11:00';

  return (
    <WorldMapView
      mapSrc={assetUrl('/sprites/guild/worldmap.png')}
      myGuildId={myGuildId}
      isOfficer={isOfficer}
      residenceZoneId={residenceZoneId}
      canSetResidence={userId != null}
      battleDayLabel={battleDayLabel}
      guildDeploys={guildDeploys.map((d) => ({ zoneId: d.zoneId, role: d.role as 'attack' | 'defend' }))}
      members={members.map((m) => ({ userId: m.userId, nickname: m.nickname }))}
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
      }))}
    />
  );
}
