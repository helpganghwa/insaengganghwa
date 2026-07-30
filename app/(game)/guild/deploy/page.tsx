import { redirect } from 'next/navigation';
import { getActiveServerId } from '@/lib/game/servers';

import { getSessionUserId } from '@/lib/auth/session';
import { assetUrl } from '@/lib/asset-versions';
import {
  getDeployBoard,
  getAttackableZoneIds,
  getZoneAdjacency,
  getWorldmapZones,
  getResidenceState,
} from '@/lib/game/guild';
import { getGuildPermState } from '@/lib/game/guild/perm-guard';
import { hasGuildPerm } from '@/lib/game/guild/permissions';
import { DeployBoard } from './DeployBoard';
import { WorldMapView } from '../map/WorldMapView';
import { DeployTerritoryTabs } from './DeployTerritoryTabs';
import { ScrollTopOnMount } from '@/components/ScrollTopOnMount';

export const dynamic = 'force-dynamic';

export default async function DeployPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const membership = await getGuildPermState(userId, serverId);
  if (!membership) redirect('/guild');

  // 남의 배치 **해제** = deploy 권한, 집행관 지정/해제 = executor 권한(0142) — 종전 길드장
  // 전속에서 개인별 위임으로 완화. 배치 자체는 본인만 하므로 권한과 무관하다.
  const canDeploy = hasGuildPerm(membership.role, membership.permissions, 'deploy');
  const canExecutor = hasGuildPerm(membership.role, membership.permissions, 'executor');
  // 배치용 + '세계지도' 탭용 데이터를 함께 로드(map/page와 동일 소스). 세계지도는 열람+팝업이라
  // 연대기·리플레이는 불필요(embedded → null). getWorldmapZones는 executor·tax·resident 포함.
  const mapSrc = assetUrl('/sprites/guild/worldmap.png');
  const [board, attackable, adjacency, wmZones, residence] = await Promise.all([
    getDeployBoard(membership.guildId),
    getAttackableZoneIds(membership.guildId),
    getZoneAdjacency(serverId),
    getWorldmapZones(serverId).catch(() => []),
    getResidenceState(userId, serverId).catch(() => null),
  ]);

  return (
    <>
      {/* 지도가 곧 첫 화면 — 앞 화면 스크롤을 물고 들어오면 지도 위쪽이 잘린다. */}
      <ScrollTopOnMount />
      <DeployTerritoryTabs
      deploy={
        <DeployBoard
          canDeploy={canDeploy}
          canExecutor={canExecutor}
          myUserId={userId}
          residence={residence}
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
          residence={residence}
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
            taxBonus: z.taxBonus,
            lastTaxAt: z.lastTaxCollectedAt ? z.lastTaxCollectedAt.getTime() : null,
            capturedAt: z.capturedAt ? z.capturedAt.getTime() : null,
            residentCount: z.residentCount,
          }))}
        />
      }
      />
    </>
  );
}
