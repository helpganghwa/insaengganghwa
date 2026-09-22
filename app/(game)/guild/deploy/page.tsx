import { redirect } from 'next/navigation';
import { taxReadyAtMs } from '@/lib/game/guild/balance';
import { taxCooldown48SinceMs, taxNextCooldownMin } from '@/lib/game/guild/tax-cooldown';
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
import { getDeployViewerState } from '@/lib/game/guild/perm-guard';
import { hasGuildPerm } from '@/lib/game/guild/permissions';
import { isDeployViewRestricted, parseDeployVisibility, toDeployMemberProps } from '@/lib/game/guild/conquest/deploy-visibility';
import { DeployBoard } from './DeployBoard';
import { WorldMapView } from '../map/WorldMapView';
import { DeployTerritoryTabs } from './DeployTerritoryTabs';
import { ScrollTopOnMount } from '@/components/ScrollTopOnMount';

export const dynamic = 'force-dynamic';

export default async function DeployPage({
  searchParams,
}: {
  searchParams: Promise<{ zone?: string }>;
}) {
  const since48 = taxCooldown48SinceMs();
  // `?zone=<id>` — 세금 수금 탭의 공석 '지정하기'에서 그 구역이 선택된 채로 들어온다(2026-09-08).
  const sp = await searchParams;
  const zoneParam = sp.zone != null && /^\d+$/.test(sp.zone) ? Number(sp.zone) : null;

  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const membership = await getDeployViewerState(userId, serverId);
  if (!membership) redirect('/guild');

  // 남의 배치 **해제** = deploy 권한, 집행관 지정/해제 = executor 권한(0142) — 종전 길드장
  // 전속에서 개인별 위임으로 완화. 배치 자체는 본인만 하므로 권한과 무관하다.
  const canDeploy = hasGuildPerm(membership.role, membership.permissions, 'deploy');
  const canExecutor = hasGuildPerm(membership.role, membership.permissions, 'executor');
  const canTax = hasGuildPerm(membership.role, membership.permissions, 'taxCollect');
  // 배치용 + '세계지도' 탭용 데이터를 함께 로드(map/page와 동일 소스). 세계지도는 열람+팝업이라
  // 연대기·리플레이는 불필요(embedded → null). getWorldmapZones는 executor·tax·resident 포함.
  const mapSrc = assetUrl('/sprites/guild/worldmap.png');
  // 배치 정보 공개 범위(0204) — '권한자만'이면 배치 담당자가 아닌 길드원에게는 **본인 배치만** 내려보낸다.
  // 화면에서 숨기는 것이 아니라 서버에서 읽지도 않는다(전원분이 RSC payload에 실리지 않게).
  const visibility = parseDeployVisibility(membership.deployVisibility);
  const restricted = isDeployViewRestricted(visibility, membership.role, membership.permissions);
  const [board, attackable, adjacency, wmZones, residence] = await Promise.all([
    getDeployBoard(membership.guildId, serverId, restricted ? { onlyUserId: userId } : {}),
    getAttackableZoneIds(membership.guildId, serverId),
    getZoneAdjacency(serverId),
    getWorldmapZones(serverId).catch(() => []),
    getResidenceState(userId, serverId).catch(() => null),
  ]);
  // 클라이언트로 넘길 멤버 목록 — 조립은 순수 함수에 맡긴다(제한 시 본인 외 정보가 섞이지 않는지 테스트로 고정).
  const memberProps = toDeployMemberProps(board.members, board.combat, userId, restricted);

  return (
    <>
      {/* 지도가 곧 첫 화면 — 앞 화면 스크롤을 물고 들어오면 지도 위쪽이 잘린다. */}
      <ScrollTopOnMount />
      <DeployTerritoryTabs
      forceTab={zoneParam != null ? 'deploy' : null}
      deploy={
        <DeployBoard
          // 제한 여부가 바뀌면 새로 마운트한다 — 보드는 members를 자체 state로 들고 있어, 열어 둔 화면에서 설정·권한이
          // 바뀐 뒤 재렌더되면 옛 목록 위에 새 규칙이 얹혀 '길드원 1명'·엉뚱한 '내 배치' 라벨 같은 거짓 표시가 난다.
          key={restricted ? 'restricted' : 'full'}
          initialZoneId={zoneParam}
          canDeploy={canDeploy}
          canExecutor={canExecutor}
          myUserId={userId}
          residence={residence}
          myGuildId={membership.guildId.toString()}
          mapSrc={mapSrc}
          attackableZoneIds={attackable}
          adjacency={adjacency}
          restricted={restricted}
          visibility={visibility}
          canSetVisibility={membership.role === 'leader'}
          members={memberProps}
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
        taxNextCooldownMin={taxNextCooldownMin()}
          embedded
          mapSrc={mapSrc}
          residence={residence}
          canSetResidence
          myUserId={userId}
          taxOfficerGuildId={canTax ? membership.guildId.toString() : null}
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
            abandoned: z.abandonedDay != null,
            lastTaxAt: z.lastTaxCollectedAt ? z.lastTaxCollectedAt.getTime() : null,
            capturedAt: z.capturedAt ? z.capturedAt.getTime() : null,
        taxReadyAt: taxReadyAtMs(z.capturedAt ? z.capturedAt.getTime() : null, z.lastTaxCollectedAt ? z.lastTaxCollectedAt.getTime() : null, since48),
            residentCount: z.residentCount,
          }))}
        />
      }
      />
    </>
  );
}
