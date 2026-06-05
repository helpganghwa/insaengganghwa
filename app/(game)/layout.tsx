import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { after } from 'next/server';

import { getSessionUserId } from '@/lib/auth/session';
import { withTimeout, DbTimeoutError } from '@/lib/db/with-timeout';
import { ensureDailyMail } from '@/lib/game/mailbox';
import { loadLayoutData } from '@/lib/game/layout-data';
import { processPendingReferral } from '@/lib/game/referral/auto-attribute';
import { AppHeader, AppHeaderShell } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { BottomNavAsync } from '@/components/BottomNavAsync';
import { SpritePreloader } from '@/components/SpritePreloader';
import { RouteTransitionOverlay } from '@/components/RouteTransitionOverlay';
import { KakaoSdkLoader } from '@/components/KakaoSdkLoader';
import { ResourceToastProvider } from '@/components/ResourceToast';
import { VersionUpdateToast } from '@/components/VersionUpdateToast';
import { DiamondProvider } from '@/components/DiamondContext';
import { getTutorialState } from '@/lib/game/tutorial';
import { TutorialCoach } from '@/components/tutorial/TutorialCoach';
import { InstallStrip } from '@/components/install/InstallStrip';

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

  // 카카오 공유 링크 가입 귀속 — pending_referral 쿠키 있으면 1회 처리(멱등).
  // after()로 응답 후 보장 실행 — fire-and-forget은 Vercel이 응답 후 함수를 종료하면
  // 트랜잭션·푸시가 끊겨 리워드가 누락될 수 있음(추천 보상은 누락되면 안 됨). 핫패스 비차단.
  after(async () => {
    try {
      await processPendingReferral(userId);
    } catch (e) {
      console.warn('[layout] referral error', e);
    }
  });

  // 헤더/네비 데이터 — 여기서 await하지 않음(Suspense 스트리밍). 두 자식이 같은 promise 공유.
  const layoutData = loadLayoutData(userId);

  return (
    <DiamondProvider>
      {/* 앱 셸 — fixed inset-0로 시각 뷰포트에 정확히 고정(안드 크롬 h-dvh+중첩스크롤
          높이 모호성 제거). 가로는 max-w-390 + mx-auto(width:auto)로 중앙 — w-full(width:100%)을
          주면 left/right-0과 over-constraint돼 좌측 정렬되므로 넣지 않는다(큰 화면 letterbox). */}
      <div className="fixed inset-0 mx-auto flex max-w-[390px] flex-col shadow-sm">
        <SpritePreloader />
        <KakaoSdkLoader />
        <RouteTransitionOverlay />
        {/* 앱 설치 권유 띠지 — 웹(비설치) 실행 시 헤더 위 전체폭 상시 노출, 닫으면 5일 뒤 재노출.
            standalone(설치됨)이면 클라에서 자동 숨김. */}
        <InstallStrip />
        <Suspense fallback={<AppHeaderShell />}>
          <AppHeader dataPromise={layoutData} />
        </Suspense>
        <ResourceToastProvider>
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            {children}
          </main>
          {/* 새 배포 자동 새로고침 + 새로고침 후 토스트(showHeaderToast 사용 — 프로바이더 안). */}
          <VersionUpdateToast />
        </ResourceToastProvider>
        <Suspense fallback={<BottomNav />}>
          <BottomNavAsync dataPromise={layoutData} />
        </Suspense>
        {/* 신규 튜토리얼 코치마크 — 상태를 promise로 전달(Suspense 미사용 → 항상 마운트,
            인트로/진행 상태 리셋 방지). 비차단(클라가 effect로 해소). */}
        <TutorialCoach statePromise={getTutorialState(userId)} />
      </div>
    </DiamondProvider>
  );
}
