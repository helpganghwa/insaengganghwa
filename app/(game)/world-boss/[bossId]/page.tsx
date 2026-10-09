import { notFound } from 'next/navigation';

import { assetUrl } from '@/lib/asset-versions';
import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { worldBossBgUrl, worldBossSpriteUrl } from '@/lib/game/world-boss/bosses';
import { getWorldBossDetail } from '@/lib/game/world-boss/queries';

import { WorldBossDetailView } from './WorldBossDetailView';

export const dynamic = 'force-dynamic';

/** 월드보스 상세(docs/WORLD-BOSS.md §9) — 보스 정보·원정대 목록(모집 중/출발)·내 원정대 패널. */
export default async function WorldBossPage({ params }: { params: Promise<{ bossId: string }> }) {
  const { bossId } = await params;
  const [userId, serverId] = await Promise.all([getSessionUserId(), getActiveServerId()]);
  const detail = await getWorldBossDetail(bossId, serverId, userId);
  if (!detail) notFound();
  return (
    <WorldBossDetailView
      detail={detail}
      serverId={serverId}
      spriteSrc={assetUrl(worldBossSpriteUrl(detail.region))}
      bgSrc={assetUrl(`/sprites/guild/region/${detail.region}.png`)}
      bossBgSrc={assetUrl(worldBossBgUrl(detail.region))}
    />
  );
}
