import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { withTimeout, DbTimeoutError } from '@/lib/db/with-timeout';
import { ensureDailyMail } from '@/lib/game/mailbox';
import { loadLayoutData } from '@/lib/game/layout-data';
import { AppHeader, AppHeaderShell } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { BottomNavAsync } from '@/components/BottomNavAsync';
import { SpritePreloader } from '@/components/SpritePreloader';
import { RouteTransitionOverlay } from '@/components/RouteTransitionOverlay';
import { KakaoSdkLoader } from '@/components/KakaoSdkLoader';
import { ResourceToastProvider } from '@/components/ResourceToast';
import { VersionUpdateToast } from '@/components/VersionUpdateToast';
import { DiamondProvider } from '@/components/DiamondContext';

/**
 * 인증 필요 라우트 그룹 — WIREFRAMES §0 셸.
 * 비로그인 → /login (로컬 JWT 검증, CLAUDE §11.1). 고정 390 중앙 컬럼.
 *
 * 콜드스타트 504 방지(2026-05-28): layout은 DB를 await하지 않는다. 헤더·네비의
 * 데이터(닉네임·다이아·dot)는 단일 promise로 만들어 Suspense 경계 안에서만 소비 →
 * 콜드 DB 커넥션이 max:1 풀에서 hang해도 셸은 즉시 200으로 스트리밍되고, 데이터는
 * 준비되면 채워지거나(가드 4s) 기본값으로 graceful degrade.
 */
export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');
  // 프로필/스타터 지급은 DB 트리거(handle_new_user) + 백필 마이그레이션 담당 — 핫패스 부트스트랩 없음.

  // 일일 보급 — KST 자정 1회 자동 발송(멱등 PK). fire-and-forget(핫패스 비차단).
  withTimeout(ensureDailyMail(userId), 2000, 'layout.dailyMail').catch((e) => {
    if (!(e instanceof DbTimeoutError)) console.warn('[layout] dailyMail error', e);
  });

  // 헤더/네비 데이터 — 여기서 await하지 않음(Suspense 스트리밍). 두 자식이 같은 promise 공유.
  const layoutData = loadLayoutData(userId);

  return (
    <DiamondProvider>
      <div className="mx-auto flex h-dvh w-full max-w-[390px] flex-1 flex-col shadow-sm">
        <SpritePreloader />
        <KakaoSdkLoader />
        <RouteTransitionOverlay />
        <Suspense fallback={<AppHeaderShell />}>
          <AppHeader dataPromise={layoutData} />
        </Suspense>
        <ResourceToastProvider>
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            {children}
          </main>
        </ResourceToastProvider>
        <Suspense fallback={<BottomNav />}>
          <BottomNavAsync dataPromise={layoutData} />
        </Suspense>
        <VersionUpdateToast />
      </div>
    </DiamondProvider>
  );
}
