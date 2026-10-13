'use client';

import { TOWER_FLOORS, TOWER_SECTION_11_OPEN_MS, towerOpenFloors } from '@/lib/game/balance';
import { serverNow } from '@/lib/client/server-clock';

/**
 * 위키는 정적 빌드라(force-static) '지금 열린 층' 문장만 클라이언트에서 서버 시각으로 그린다 —
 * 11구간 개방 자정을 넘기면 새 빌드 없이도 바뀐다(빌드 시점 값으로 먼저 그려지고 수화 뒤 맞춰진다).
 */
export function TowerOpenFloors() {
  const open = towerOpenFloors(serverNow());
  const kst = new Date(TOWER_SECTION_11_OPEN_MS + 9 * 3600_000);
  const when = `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 0시`;
  return (
    <span suppressHydrationWarning>
      지금 열린 층은 1~{open}층이다{open < TOWER_FLOORS ? `(${open + 1}~${TOWER_FLOORS}층은 ${when}에 열린다)` : ''}.
    </span>
  );
}
