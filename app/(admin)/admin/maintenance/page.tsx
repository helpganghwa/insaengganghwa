import { getMaintenanceState } from '@/lib/game/system-mode';

import { MaintenanceClient } from './MaintenanceClient';

/**
 * 관리자 서버 점검 제어 — 점검/긴급정지 토글(시간지정·무기한). (admin) 레이아웃이 게이트.
 * 점검 중에도 isAdmin은 게임 접근 가능, 로그인 페이지는 항상 접속 가능.
 */
export const dynamic = 'force-dynamic';

export default async function AdminMaintenancePage() {
  const s = await getMaintenanceState();
  return (
    <div className="mx-auto w-full max-w-[480px] space-y-4 px-4 py-6 text-zinc-100">
      <div>
        <h1 className="text-xl font-bold">🔧 서버 점검</h1>
        <p className="mt-1 text-xs text-zinc-500">
          점검 중 일반 유저는 풀사이즈 점검화면, 운영자(어드민)는 정상 접근. 로그인은 항상 가능.
        </p>
      </div>
      <MaintenanceClient
        current={{
          mode: s.mode,
          active: s.active,
          fromIso: s.from ? s.from.toISOString() : null,
          untilIso: s.until ? s.until.toISOString() : null,
          note: s.note,
        }}
      />
    </div>
  );
}
