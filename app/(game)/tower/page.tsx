import type { Metadata } from 'next';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { towerBoard } from '@/lib/game/tower/service';

import { RefreshOnResume } from '@/components/RefreshOnResume';

import { TowerClient } from './TowerClient';

export const metadata: Metadata = { title: '무한의 탑' };
export const dynamic = 'force-dynamic';

/** 무한의 탑(docs/TOWER.md) — 층 목록 · 층 상세 · 전투 재생 · 결과 팝업을 한 화면 안에서 전환한다. 인증은 (game) 레이아웃. */
export default async function TowerPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) return null;
  const board = await towerBoard(userId, serverId);
  // 화면을 열어 둔 채 자정·월요일 0시를 넘기거나 다른 기기에서 도전을 쓴 뒤 돌아오면 다시 불러온다.
  return (
    <>
      <RefreshOnResume />
      <TowerClient board={board} />
    </>
  );
}
