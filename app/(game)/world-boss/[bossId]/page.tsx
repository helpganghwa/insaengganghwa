import { notFound } from 'next/navigation';

import { RefreshOnResume } from '@/components/RefreshOnResume';

import { assetUrl } from '@/lib/asset-versions';
import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { SHADOW_QUEEN_FX, worldBossAnimUrl, worldBossBgUrl, worldBossName, worldBossSpriteUrl } from '@/lib/game/world-boss/bosses';
import { getWorldBossDetail } from '@/lib/game/world-boss/queries';
import { getSoloBossDetail } from '@/lib/game/world-boss/solo-queries';

import { SoloBossView } from './SoloBossView';
import { WorldBossDetailView } from './WorldBossDetailView';

export const dynamic = 'force-dynamic';

function leftText(leaveAt: string, status: string): string {
  if (status === 'left') return '사라졌어요';
  const m = Math.ceil((new Date(leaveAt).getTime() - Date.now()) / 60_000);
  if (m <= 0) return '곧 사라져요';
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d > 0 ? `${d}일 ${h}시간 남음` : h > 0 ? `${h}시간 ${m % 60}분 남음` : `${m}분 남음`;
}

/** 월드보스 상세(docs/WORLD-BOSS.md §9) — 원정대 보스는 보스 정보·원정대 목록, 개인 보스(0253)는 순위표·도전. */
export default async function WorldBossPage({ params }: { params: Promise<{ bossId: string }> }) {
  const { bossId } = await params;
  const [userId, serverId] = await Promise.all([getSessionUserId(), getActiveServerId()]);
  const solo = await getSoloBossDetail(bossId, serverId, userId);
  if (solo) {
    const fx = {
      idle: assetUrl(worldBossAnimUrl(solo.bossCode)),
      crouch: assetUrl(SHADOW_QUEEN_FX.crouch),
      climb: assetUrl(SHADOW_QUEEN_FX.climb),
      bind: assetUrl(SHADOW_QUEEN_FX.bind),
      expose: assetUrl(SHADOW_QUEEN_FX.expose),
      webshot: assetUrl(SHADOW_QUEEN_FX.webshot),
      webnet: assetUrl(SHADOW_QUEEN_FX.webnet),
    };
    const withSrc = (s: string | null) => (s ? assetUrl(s) : null);
    const detail = {
      ...solo,
      pool: { weapon: solo.pool.weapon.map((x) => ({ ...x, src: withSrc(x.src) })), armor: solo.pool.armor.map((x) => ({ ...x, src: withSrc(x.src) })), accessory: solo.pool.accessory.map((x) => ({ ...x, src: withSrc(x.src) })) },
      me: solo.me ? { ...solo.me, pieces: solo.me.pieces.map((p) => ({ ...p, src: withSrc(p.src) })) } : null,
    };
    return (
      <>
        <RefreshOnResume />
        <SoloBossView
          detail={detail}
          spriteSrc={assetUrl(worldBossSpriteUrl(solo.bossCode))}
          bgSrc={assetUrl(worldBossBgUrl(solo.bossCode))}
          fx={fx}
          leftText={leftText(solo.leaveAt, solo.status)}
          bossName={worldBossName(solo.bossCode)}
        />
      </>
    );
  }
  const detail = await getWorldBossDetail(bossId, serverId, userId);
  if (!detail) notFound();
  return (
    <>
      {/* 푸시로 돌아오면 다시 읽는다 — 대장이 열어 둔 화면에 신청·초대 수락이 반영되게(탑·강화와 같은 방식). */}
      <RefreshOnResume />
      <WorldBossDetailView
      detail={detail}
      serverId={serverId}
      spriteSrc={assetUrl(worldBossSpriteUrl(detail.bossCode))}
      bgSrc={assetUrl(worldBossBgUrl(detail.bossCode))}
    />
    </>
  );
}
