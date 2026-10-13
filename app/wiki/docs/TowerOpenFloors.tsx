'use client';

import { useSyncExternalStore } from 'react';

import { TOWER_FLOORS, TOWER_SECTION, TOWER_SECTION_11_OPEN_MS, towerOpenFloors } from '@/lib/game/balance';
import { serverNow } from '@/lib/client/server-clock';

const subscribe = () => () => {};
const getSnapshot = () => towerOpenFloors(serverNow());
const getServerSnapshot = () => null;

/**
 * 위키는 정적 빌드라(force-static) '지금 열린 층' 문장만 클라이언트에서 서버 시각으로 그린다 — 11구간 개방 자정을 넘기면
 * 새 빌드 없이도 바뀐다. 서버 스냅샷은 null(개방 전 문장)로 두고 수화 뒤 실제 값으로 **다시 렌더**한다 —
 * suppressHydrationWarning은 React 19에서 어긋난 텍스트를 고쳐 쓰지 않아(빌드 시각 문장이 그대로 남음) 쓰지 않는다(2026-10-14 검수).
 */
export function TowerOpenFloors() {
  const live = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const open = live ?? TOWER_FLOORS - TOWER_SECTION;
  const kst = new Date(TOWER_SECTION_11_OPEN_MS + 9 * 3600_000);
  const when = `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 0시`;
  return (
    <span>
      지금 열린 층은 1~{open}층이다{open < TOWER_FLOORS ? `(${open + 1}~${TOWER_FLOORS}층은 ${when}에 열린다)` : ''}.
    </span>
  );
}
