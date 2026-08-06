import 'server-only';

import { getSessionUserId, isReviewerAccount } from '@/lib/auth/session';
import { getAdminStatus } from '@/lib/auth/require-admin';
import { getBanStateCached } from '@/lib/game/account/ban';
import { getMaintenanceState } from '@/lib/game/system-mode';

/**
 * 변이 서버 액션 공통 게이트 — 정지(우선)/점검이면 차단 코드, 아니면 null. userId는 내부에서
 * 로컬 JWT로 해소(인자 불필요). 사용:
 *   const b = await actionBlock();
 *   if (b) return err(b);                              // err 헬퍼형
 *   if (b) return { status: 'error', code: b } as const; // 인라인형
 * (레이아웃은 banned/maintenance면 화면을 막지만, 서버 액션은 레이아웃을 안 거쳐 직접 POST로
 *  우회 가능 — 자원변경 액션 입구에서 이 게이트로 막는다. 감사 M2·M3.)
 */
export async function actionBlock(): Promise<'BANNED' | 'MAINTENANCE' | null> {
  const userId = await getSessionUserId();
  if (userId) {
    // ban 캐시(15s)는 레이아웃과 공유 — lib/game/account/ban.ts getBanStateCached(2026-08-06).
    const banned = await getBanStateCached(userId)
      .then((s) => s.banned)
      .catch(() => false);
    if (banned) return 'BANNED';
  }
  const maint = await getMaintenanceState().catch(() => null);
  if (maint?.active) {
    // CBT 종료 모드(0144) — 카드사 심사가 진행 중이라 심사(cbt) 계정과 어드민은 액션을
    // 계속 쓸 수 있어야 한다(결제 테스트). 일반 유저만 차단. 점검(maintenance)은 전원 차단 유지.
    if (maint.mode === 'cbt_ended') {
      const { isAdmin } = await getAdminStatus().catch(() => ({ isAdmin: false }));
      if (isAdmin || (await isReviewerAccount().catch(() => false))) return null;
    }
    return 'MAINTENANCE';
  }
  return null;
}
