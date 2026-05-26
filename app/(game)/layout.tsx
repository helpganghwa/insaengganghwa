import { redirect } from 'next/navigation';
import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout, DbTimeoutError } from '@/lib/db/with-timeout';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { mailbox } from '@/lib/db/schema/mailbox';
import { ensureDailyMail } from '@/lib/game/mailbox';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { SpritePreloader } from '@/components/SpritePreloader';
import { RouteTransitionOverlay } from '@/components/RouteTransitionOverlay';
import { KakaoSdkLoader } from '@/components/KakaoSdkLoader';
import { ResourceToastProvider } from '@/components/ResourceToast';
import { VersionUpdateToast } from '@/components/VersionUpdateToast';

/**
 * 인증 필요 라우트 그룹 — WIREFRAMES §0 셸.
 * 비로그인 → /login (로컬 JWT 검증, CLAUDE §11.1). 고정 390 중앙 컬럼.
 */
export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');
  // 프로필/스타터 지급은 DB 트리거(auth.users INSERT → handle_new_user) + 기존 유저
  // 백필 마이그레이션이 담당 — 앱 렌더 핫패스에 부트스트랩 없음(hang 위험 제거).

  // 알림 dot — 강화 완료 + 우편 미수령. 핫패스(모든 인증 페이지에서 1회).
  // 5s 타임아웃 가드 + Promise.all로 두 쿼리 병렬(§11.4).
  let hasCompletedEnhance = false;
  let hasUnreadMail = false;
  try {
    const [enhanceRow, mailRow] = await withTimeout(
      Promise.all([
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
        // 우편 미수령(만료 안 됨). exists 패턴: limit 1 + 존재 여부만.
        db
          .select({ id: mailbox.id })
          .from(mailbox)
          .where(
            and(
              eq(mailbox.userId, userId),
              isNull(mailbox.claimedAt),
              or(isNull(mailbox.expiresAt), gt(mailbox.expiresAt, sql`now()`)),
            ),
          )
          .limit(1),
      ]),
      5000,
      'layout.badges',
    );
    hasCompletedEnhance = (enhanceRow[0]?.n ?? 0) > 0;
    hasUnreadMail = mailRow.length > 0;
  } catch (e) {
    if (!(e instanceof DbTimeoutError)) throw e;
    console.warn('[layout] badges timeout — dots skipped');
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
      <AppHeader userId={userId} hasUnreadMail={hasUnreadMail} />
      <ResourceToastProvider>
        <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
      </ResourceToastProvider>
      <BottomNav hasCompletedEnhance={hasCompletedEnhance} />
      <VersionUpdateToast />
    </div>
  );
}
