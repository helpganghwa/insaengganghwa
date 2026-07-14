import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';

import { getSessionUserId } from '@/lib/auth/session';
import { getAdminStatus } from '@/lib/auth/require-admin';
import { getMaintenanceState } from '@/lib/game/system-mode';
import { getBanState } from '@/lib/game/account/ban';
import { withTimeout, DbTimeoutError } from '@/lib/db/with-timeout';
import { MaintenanceScreen } from './MaintenanceScreen';
import { BanScreen } from './BanScreen';
import { ensureDailyMail, ensurePremiumDailyMail } from '@/lib/game/mailbox';
import { ensureCbtCarryover } from '@/lib/game/cbt/grant';
import { loadLayoutData } from '@/lib/game/layout-data';
import { getActiveServerId } from '@/lib/game/servers';
import {
  processPendingReferral,
  PENDING_REFERRAL_COOKIE,
  PENDING_REFERRAL_AT_COOKIE,
} from '@/lib/game/referral/auto-attribute';
import { AppHeader, AppHeaderShell } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { GuideTicker } from '@/components/GuideTicker';
import { BottomNavAsync } from '@/components/BottomNavAsync';
import { SpritePreloader } from '@/components/SpritePreloader';
import { SfxUnlock } from '@/components/audio/SfxUnlock';
import { PresenceHeartbeat } from '@/components/PresenceHeartbeat';
import { PushAutoSync } from '@/components/PushAutoSync';
import { RouteTransitionOverlay } from '@/components/RouteTransitionOverlay';
import { KakaoSdkLoader } from '@/components/KakaoSdkLoader';
import { ResourceToastProvider } from '@/components/ResourceToast';
import { VersionUpdateToast } from '@/components/VersionUpdateToast';
import { DiamondProvider } from '@/components/DiamondContext';
import { getTutorialState } from '@/lib/game/tutorial';
import { TutorialCoach } from '@/components/tutorial/TutorialCoach';
import { InstallStrip } from '@/components/install/InstallStrip';
import { kstDateString } from '@/lib/kst';

// 일일 보급(보급·CBT이월)의 유저·서버·KST일 단위 성공 마크 — 매 페이지 로드마다 나가던
// 응답 후 쓰기를 하루 1회(인스턴스당)로 줄인다(자정 herd 완화). 에러 없이 끝난 경우에만
// 마크(부분 실패는 다음 로드에서 재시도). 멱등이라 인스턴스 교체로 재실행돼도 안전.
// ⚠ 프리미엄 daily는 이 스로틀 대상이 아님 — 하루 중 구매로 상태가 바뀌는 유일한 ensure.
const dailyEnsured = new Map<string, number>();
function pruneDailyEnsured() {
  if (dailyEnsured.size < 10_000) return;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [k, at] of dailyEnsured) if (at < cutoff) dailyEnsured.delete(k);
}

/**
 * 인증 필요 라우트 그룹 — WIREFRAMES §0 셸.
 * 비로그인 → /login (로컬 JWT 검증, CLAUDE §11.1). 고정 390 중앙 컬럼.
 *
 * 콜드스타트 504 방지(2026-05-28): layout은 DB를 await하지 않는다. 헤더·네비의
 * 데이터(닉네임·다이아·dot)는 단일 promise로 만들어 Suspense 경계 안에서만 소비 →
 * 콜드 DB 커넥션이 풀에서 hang해도 셸은 즉시 200으로 스트리밍되고, 데이터는
 * 준비되면 채워지거나(가드 4s) 기본값으로 graceful degrade.
 */
export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');
  // 캐릭터/스타터 지급은 로그인 콜백(createCharacterAuto)이 담당(트리거 0067은 계정행만).
  // 콜백 실패로 캐릭터가 없는 계정은 loadLayoutData의 자가복구가 생성 — 핫패스 부트스트랩 없음.

  // 서버 점검 게이트 — 점검 유효 + 비-어드민이면 게임 대신 풀사이즈 점검화면(로그인은 그룹 밖이라 접속 가능).
  //  캐시(20s)라 대부분 DB 미접촉. 행 부재/조회 지연은 fail-open(점검 아님)으로 콜드스타트 안전.
  const maint = await withTimeout(getMaintenanceState(), 1500, 'layout.maint').catch(() => null);
  if (maint?.active) {
    const { isAdmin } = await getAdminStatus();
    if (!isAdmin) return <MaintenanceScreen state={maint} />;
  }

  // 계정 정지 게이트 — banned면 게임 대신 정지화면(사유·기간 노출). 조회 실패는 fail-open(통과).
  const ban = await withTimeout(getBanState(userId), 1500, 'layout.ban').catch(() => null);
  if (ban?.banned) return <BanScreen state={ban} />;

  // 일일 보급 + 성장 프리미엄 일일 보상 — KST 자정 1회 자동 발송(멱등 PK). 핫패스 비차단.
  //  after()로 응답 후 보장 실행 — bare non-await는 Fluid가 응답 후 인스턴스 회수 시 INSERT가
  //  끊겨 그날 보급이 누락될 수 있음(referral 패턴과 통일). 멱등이라 재진입 시 안전.
  const dailySid = await getActiveServerId();
  const ensureKey = `${userId}:${dailySid}:${kstDateString()}`;
  const throttled = dailyEnsured.has(ensureKey);
  after(async () => {
    // 프리미엄 daily는 스로틀 제외 — 프리미엄 활성 상태가 하루 중 바뀔 수 있어(낮에 구매 →
    // 구매일=1일차 지급) 마크 뒤에도 매 로드 실행해야 함. 미보유 시 CTE가 비어 싼 no-op.
    await withTimeout(ensurePremiumDailyMail(userId, dailySid), 2000, 'layout.premiumDaily').catch(
      (e) => {
        if (!(e instanceof DbTimeoutError)) console.warn('[layout] premiumDaily error', e);
      },
    );
    if (throttled) return;
    let allOk = true;
    await withTimeout(ensureDailyMail(userId, dailySid), 2000, 'layout.dailyMail').catch((e) => {
      allOk = false;
      if (!(e instanceof DbTimeoutError)) console.warn('[layout] dailyMail error', e);
    });
    // CBT 보상 이월 — 실운영에서 1회 지급(멱등). CBT/스냅샷 전엔 테이블이 비어 no-op.
    await withTimeout(ensureCbtCarryover(userId, dailySid), 3000, 'layout.cbtCarryover').catch(
      (e) => {
        allOk = false;
        if (!(e instanceof DbTimeoutError)) console.warn('[layout] cbtCarryover error', e);
      },
    );
    if (allOk) {
      pruneDailyEnsured();
      dailyEnsured.set(ensureKey, Date.now());
    }
  });

  // 카카오 공유 링크 가입 귀속 — pending_referral 쿠키 있으면 1회 처리(멱등).
  // 쿠키는 **요청 스코프에서 먼저 읽는다**(cookies()를 after() 안에서 호출하면 Next가 throw).
  // 값만 after()로 넘겨 응답 후 보장 실행 — fire-and-forget은 Vercel이 응답 후 함수를 종료하면
  // 트랜잭션·푸시가 끊겨 리워드가 누락될 수 있음(추천 보상은 누락되면 안 됨). 핫패스 비차단.
  const cookieStore = await cookies();
  const referralCode = cookieStore.get(PENDING_REFERRAL_COOKIE)?.value;
  if (referralCode) {
    // 클릭 시각(신규 가입 판정용) — 레거시 쿠키엔 없을 수 있어 옵셔널.
    const atRaw = cookieStore.get(PENDING_REFERRAL_AT_COOKIE)?.value;
    const clickedAtMs = atRaw && /^\d+$/.test(atRaw) ? Number(atRaw) : undefined;
    after(async () => {
      try {
        await processPendingReferral(userId, referralCode, clickedAtMs);
      } catch (e) {
        console.warn('[layout] referral error', e);
      }
    });
  }

  // 헤더/네비 데이터 — 여기서 await하지 않음(Suspense 스트리밍). 두 자식이 같은 promise 공유.
  const layoutData = getActiveServerId().then((sid) => loadLayoutData(userId, sid));

  return (
    <DiamondProvider>
      {/* 앱 셸 — fixed inset-0로 시각 뷰포트에 정확히 고정(안드 크롬 h-dvh+중첩스크롤
          높이 모호성 제거). 가로는 max-w-390 + mx-auto(width:auto)로 중앙 — w-full(width:100%)을
          주면 left/right-0과 over-constraint돼 좌측 정렬되므로 넣지 않는다(큰 화면 letterbox). */}
      <div className="fixed inset-0 mx-auto flex max-w-[390px] flex-col shadow-sm">
        <SpritePreloader />
        <SfxUnlock />
        <PresenceHeartbeat />
        <PushAutoSync />
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
        {/* 가이드 팁 티커 — GNB 바로 위 롤링(끄기 가능, 튜토리얼 중 자동 숨김). */}
        <GuideTicker />
        <Suspense fallback={<BottomNav />}>
          <BottomNavAsync dataPromise={layoutData} />
        </Suspense>
        {/* 신규 튜토리얼 코치마크 — 상태를 promise로 전달(Suspense 미사용 → 항상 마운트,
            인트로/진행 상태 리셋 방지). 비차단(클라가 effect로 해소). */}
        <TutorialCoach statePromise={getActiveServerId().then((sid) => getTutorialState(userId, sid))} />
      </div>
    </DiamondProvider>
  );
}
