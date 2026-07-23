import { redirect } from 'next/navigation';
import { getActiveServerId } from '@/lib/game/servers';

import { getSessionUserId } from '@/lib/auth/session';
import { assetUrl } from '@/lib/asset-versions';
import {
  getMyMembership,
  getDeployBoard,
  getAttackableZoneIds,
  getZoneAdjacency,
  getWorldmapZones,
  getResidence,
} from '@/lib/game/guild';
import { DeployBoard } from './DeployBoard';
import { WorldMapView } from '../map/WorldMapView';
import { DeployTerritoryTabs } from './DeployTerritoryTabs';

export const dynamic = 'force-dynamic';

export default async function DeployPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const membership = await getMyMembership(userId, serverId);
  if (!membership) redirect('/guild');

  // 남 배치·집행관 지정/해제·구역 포기는 길드장 전속(2026-07-10 권한 조정).
  const isLeader = membership.role === 'leader';
  // 배치용 + '세계지도' 탭용 데이터를 함께 로드(map/page와 동일 소스). 세계지도는 열람+팝업이라
  // 연대기·리플레이는 불필요(embedded → null). getWorldmapZones는 executor·tax·resident 포함.
  const mapSrc = assetUrl('/sprites/guild/worldmap.png');
  const [board, attackable, adjacency, wmZones, residence] = await Promise.all([
    getDeployBoard(membership.guildId),
    getAttackableZoneIds(membership.guildId),
    getZoneAdjacency(serverId),
    getWorldmapZones(serverId).catch(() => []),
    getResidence(userId, serverId).catch(() => null),
  ]);

  return (
    <DeployTerritoryTabs
      deploy={
        <DeployBoard
          isLeader={isLeader}
          myUserId={userId}
          myGuildId={membership.guildId.toString()}
          mapSrc={mapSrc}
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
      }
      worldmap={
        <WorldMapView
          embedded
          mapSrc={mapSrc}
          residenceZoneId={residence}
          canSetResidence
          myUserId={userId}
          serverId={serverId}
          chronicle={null}
          replay={null}
          replayYesterday={null}
          adjacency={adjacency}
          zones={wmZones.map((z) => ({
            id: z.id,
            region: z.region,
            name: z.name,
            mapX: z.mapX,
            mapY: z.mapY,
            ownerGuildId: z.ownerGuildId?.toString() ?? null,
            ownerGuildName: z.ownerGuildName,
            ownerEmblemUrl: z.ownerEmblemUrl,
            ownerEmblemColor: z.ownerEmblemColor,
            executorUserId: z.executorUserId,
            executorNickname: z.executorNickname,
            executorCode: z.executorCode,
            taxDiamond: z.taxDiamond.toString(),
            lastTaxAt: z.lastTaxCollectedAt ? z.lastTaxCollectedAt.getTime() : null,
            residentCount: z.residentCount,
          }))}
        />
      }
    />
  );
}
