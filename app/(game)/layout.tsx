import { redirect } from 'next/navigation';
import { and, eq, lte, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout, DbTimeoutError } from '@/lib/db/with-timeout';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { ensureDailyMail } from '@/lib/game/mailbox';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { SpritePreloader } from '@/components/SpritePreloader';
import { RouteTransitionOverlay } from '@/components/RouteTransitionOverlay';
import { KakaoSdkLoader } from '@/components/KakaoSdkLoader';

/**
 * 인증 필요 라우트 그룹 — WIREFRAMES §0 셸.
 * 비로그인 → /login (로컬 JWT 검증, CLAUDE §11.1). 고정 390 중앙 컬럼.
 */
export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');
  // 프로필/스타터 지급은 DB 트리거(auth.users INSERT → handle_new_user) + 기존 유저
  // 백필 마이그레이션이 담당 — 앱 렌더 핫패스에 부트스트랩 없음(hang 위험 제거).

  // BottomNav 알림 dot — 완료 시점 도달한 강화 작업 존재 여부(서버 시계).
  // 핫패스(모든 인증 페이지에서 1회). 5s 타임아웃 가드 → 매달리면 dot 미표시 폴백.
  let hasCompletedEnhance = false;
  try {
    const [row] = await withTimeout(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(enhancementJobs)
        .where(
          and(
            eq(enhancementJobs.userId, userId),
            eq(enhancementJobs.status, 'running'),
            lte(enhancementJobs.completeAt, sql`now()`),
          ),
        ),
      5000,
      'layout.enhance-count',
    );
    hasCompletedEnhance = (row?.n ?? 0) > 0;
  } catch (e) {
    if (!(e instanceof DbTimeoutError)) throw e;
    // 폴백: 알림 dot 안 보이는 것뿐, 사용자가 강화소 진입 시 정확한 상태 확인됨.
    console.warn('[layout] enhance-count timeout — dot skipped');
  }

  // 일일 보급 — KST 자정 1회 자동 발송(멱등 PK). 핫패스 가벼움(빠른 INSERT/no-op).
  // 짧은 가드 + 실패 silent(다음 진입에서 재시도, 사용자 영향 X).
  withTimeout(ensureDailyMail(userId), 2000, 'layout.dailyMail').catch((e) => {
    if (!(e instanceof DbTimeoutError)) console.warn('[layout] dailyMail error', e);
  });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-1 flex-col shadow-sm">
      <SpritePreloader />
      <KakaoSdkLoader />
      <RouteTransitionOverlay />
      <AppHeader userId={userId} />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <BottomNav hasCompletedEnhance={hasCompletedEnhance} />
    </div>
  );
}
