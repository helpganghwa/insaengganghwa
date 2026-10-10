import { openServerIds } from '@/lib/game/server-list';
import { adminWorldBossBoard } from '@/lib/game/world-boss/admin';

import { WorldBossAdminClient } from './WorldBossAdminClient';

/**
 * 관리자 월드보스 소환(docs/WORLD-BOSS.md §1, 10-11) — 서버·구역을 골라 즉시 또는 예약 소환, 예정 취소.
 * 자동 추첨은 없다. 이미 출현 중·예정인 보스와 머무는 시간이 겹치면(동시에 2마리) 화면이 한 번 더 묻는다. (admin) 레이아웃이 게이트.
 */
export const dynamic = 'force-dynamic';

export default async function AdminWorldBossPage() {
  const serverIds = await openServerIds();
  const board = await adminWorldBossBoard(serverIds);
  return (
    <div className="mx-auto w-full max-w-[560px] space-y-4 px-4 py-6 text-zinc-100">
      <div>
        <h1 className="text-xl font-bold">🔥 월드보스 소환</h1>
        <p className="mt-1 text-xs text-zinc-500">
          구역을 골라 즉시 또는 예약으로 소환. 48시간 머물고 구역당 한 마리. 출현 중·예정인 보스와 겹치면(동시에 2마리) 한 번 더 묻고 진행.
        </p>
      </div>
      <WorldBossAdminClient board={board} />
    </div>
  );
}
