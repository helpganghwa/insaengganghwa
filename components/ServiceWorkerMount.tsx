'use client';

import { useEffect } from 'react';

import { registerServiceWorker } from '@/lib/push/client';

/**
 * 서비스워커 등록 — 루트 레이아웃에서 **모든 화면**에 건다(2026-09-11 전수조사).
 *
 * 종전엔 PushAutoSync(게임 레이아웃·권한 granted)에서만 등록해, 로그인 전이나 알림을 켜지 않은
 * 기기에는 워커가 아예 없었다. 그래서 오프라인 폴백이 걸릴 자리가 없어 네트워크가 끊기면
 * 크롬 기본 오류 페이지가 화면을 통째로 덮었다(앱은 주소창이 없어 더 막막하다).
 *
 * 워커의 책임은 푸시와 내비게이션 폴백뿐이고 응답을 캐시하지 않는다 — 등록 범위를 넓혀도
 * 자산이 낡을 위험은 없다(public/sw.js 주석 참조).
 *
 * ⚠ 게이트는 **서비스워커 지원 여부만** 본다. 종전엔 푸시 지원(checkPushSupport)으로 걸렀는데,
 *   워커는 있지만 PushManager/Notification이 없는 브라우저가 'unsupported'로 분류돼 푸시와 함께
 *   **오프라인 폴백까지 사라졌다**(2026-09-12 재검수). 폴백은 푸시와 무관한 기능이다.
 */
export function ServiceWorkerMount() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    // 위키 호스트에는 걸지 않는다 — /sw.js가 본 도메인으로 리다이렉트돼(proxy.ts 위키 가드)
    // 교차 오리진 리다이렉트로 등록이 매번 실패한다. 위키는 폴백도 푸시도 쓰지 않는다.
    if (window.location.hostname.startsWith('wiki.')) return;
    void registerServiceWorker();
  }, []);
  return null;
}
