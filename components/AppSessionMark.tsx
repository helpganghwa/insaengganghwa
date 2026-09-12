'use client';

import { useEffect } from 'react';

import { APP_SESSION_KEY } from '@/lib/platform-client';

/**
 * 앱(TWA) 진입 표식을 이 브라우징 컨텍스트에 남긴다.
 *
 * proxy.ts가 `/?src=twa`를 `/#app`으로 리다이렉트하면 여기서 sessionStorage로 옮기고 해시를 지운다.
 * 쿠키(`ig_platform`)는 앱과 크롬이 저장소를 공유해 같은 기기의 브라우저 탭으로 새지만,
 * sessionStorage는 탭·앱마다 독립이라 새지 않는다. 결제 경로 안전망이 이 값을 쓴다
 * (lib/platform-client.ts usePlayBilling — 2026-09-11 전수조사).
 */
/**
 * 앱이 연 내비게이션인가 — 크롬은 TWA로 열린 첫 이동의 referrer를 `android-app://<패키지>`로 준다.
 *
 * 시작 주소(`/?src=twa`)를 거치지 않는 진입에는 표식이 하나도 안 생기는 구멍이 있었다. 앱의
 * 링크 필터에 경로 제한이 없어 카톡 공유 링크·푸시 클릭이 전부 앱으로 열리는데, 그 경로는
 * 시작 주소를 타지 않는다(2026-09-12 검수). referrer는 진입 경로와 무관하게 붙으므로 그 구멍을 메운다.
 * 패키지를 정확히 대조한다 — 다른 앱이 연 경우까지 우리 앱으로 보면 안 된다.
 */
const APP_REFERRER = 'android-app://app.ganghwa.game';

export function AppSessionMark() {
  useEffect(() => {
    const fromApp = document.referrer.startsWith(APP_REFERRER);
    if (window.location.hash !== '#app' && !fromApp) return;
    try {
      window.sessionStorage.setItem(APP_SESSION_KEY, '1');
    } catch {
      // 프라이빗 모드 등 저장 불가 — 쿠키 경로가 그대로 받친다.
    }
    if (window.location.hash !== '#app') return;
    // 해시를 지워 주소와 공유 링크에 남지 않게 한다(히스토리 항목은 늘리지 않는다).
    //
    // ⚠ **state를 null로 덮으면 안 된다.** 이 effect는 루트 레이아웃의 자식이라 Next가 history를
    // 감싸기 **전에** 돈다. 그래서 여기 호출은 네이티브 replaceState이고, Next가 심어 둔 내부 값
    // (`__NA`·트리)을 통째로 지운다. 프로덕션 실측(2026-09-12): 일반 진입은
    // `[igModal, __NA, TREE]`인데 `/?src=twa`로 들어오면 `[igModal]`만 남았다.
    // 그 상태에서 뒤로가기를 누르면 Next가 자기 항목이 아니라고 보고 **앱을 통째로 새로고침**하거나
    // 아무 일도 하지 않는다(주소만 바뀌고 화면은 그대로 → 한 번 더 누르면 앱 종료).
    // 기존 state를 그대로 넘기면 패치 전후 어느 시점이든 안전하다.
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
  }, []);
  return null;
}
