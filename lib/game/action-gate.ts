import 'server-only';

import { getSessionUserId } from '@/lib/auth/session';
import { getBanState } from '@/lib/game/account/ban';
import { getMaintenanceState } from '@/lib/game/system-mode';

// ban 짧은 캐시(per-user, 15s) — 변이 액션마다 profiles 조회를 줄임(핫패스 §11.4). 레이아웃이
// 페이지 렌더 시 즉시 BanScreen으로 차단하므로, 액션 레벨 차단은 ≤15s 지연 허용.
const banCache = new Map<string, { banned: boolean; at: number }>();
const BAN_TTL = 15_000;

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
    const cached = banCache.get(userId);
    const now = Date.now();
    let banned: boolean;
    if (cached && now - cached.at < BAN_TTL) {
      banned = cached.banned;
    } else {
      banned = await getBanState(userId)
        .then((s) => s.banned)
        .catch(() => false);
      banCache.set(userId, { banned, at: now });
    }
    if (banned) return 'BANNED';
  }
  const maint = await getMaintenanceState().catch(() => null);
  if (maint?.active) return 'MAINTENANCE';
  return null;
}
