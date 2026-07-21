import { assetUrl } from '@/lib/asset-versions';
import { getActiveServerId } from '@/lib/game/servers';
import { getSessionUserId } from '@/lib/auth/session';
import { getWorldmapZones, getResidence, getChronicle, getZoneAdjacency, getConquestReplay } from '@/lib/game/guild';

import { ChronicleReadMark } from './ChronicleReadMark';
import { WorldMapView } from './WorldMapView';

export const dynamic = 'force-dynamic';

export default async function WorldMapPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();

  // 모든 쿼리를 .catch로 방어 — 풀러 클라 커넥션 포화(EMAXCONN) 등 일시 DB 실패에도 페이지가
  // 통째로 크래시되지 않고 degrade(빈 맵·거주지 미표시). getResidence 미방어로 전체 렌더가
  // 터지던 문제 방지(2026-07-13, digest 3878315197).
  const [zones, residenceZoneId, chronicle, replay, adjacency] = await Promise.all([
    getWorldmapZones(serverId).catch(() => []),
    userId ? getResidence(userId, serverId).catch(() => null) : Promise.resolve(null),
    getChronicle(serverId).catch(() => null),
    getConquestReplay(serverId).catch(() => null),
    getZoneAdjacency(serverId).catch(() => []),
  ]);
  // 어제 리플레이 — 연대기 로드 결과(어제 기록일)에 의존해 후속 1회(가벼움, 상세 페이지).
  const replayYesterday = chronicle?.yesterdayDay
    ? await getConquestReplay(serverId, chronicle.yesterdayDay).catch(() => null)
    : null;

  return (
    <>
    {/* 세계지도 진입 = 연대기 열람 — 홈 카드 '새 역사' 티저를 카운트다운으로 복귀시킨다. */}
    <ChronicleReadMark serverId={serverId} day={chronicle?.todayDay ?? null} />
    <WorldMapView
      mapSrc={assetUrl('/sprites/guild/worldmap.png')}
      residenceZoneId={residenceZoneId}
      canSetResidence={userId != null}
      myUserId={userId}
      serverId={serverId}
      chronicle={chronicle}
      replay={replay}
      replayYesterday={replayYesterday}
      adjacency={adjacency}
      zones={zones.map((z) => ({
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
    </>
  );
}
