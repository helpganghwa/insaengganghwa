'use client';

import { useEffect } from 'react';

import { checkPushSupport, registerServiceWorker } from '@/lib/push/client';

/**
 * 서비스워커 등록 — 루트 레이아웃에서 **모든 화면**에 건다(2026-09-11 전수조사).
 *
 * 종전엔 PushAutoSync(게임 레이아웃·권한 granted)에서만 등록해, 로그인 전이나 알림을 켜지 않은
 * 기기에는 워커가 아예 없었다. 그래서 오프라인 폴백이 걸릴 자리가 없어 네트워크가 끊기면
 * 크롬 기본 오류 페이지가 화면을 통째로 덮었다(앱은 주소창이 없어 더 막막하다).
 *
 * 워커의 책임은 푸시와 내비게이션 폴백뿐이고 응답을 캐시하지 않는다 — 등록 범위를 넓혀도
 * 자산이 낡을 위험은 없다(public/sw.js 주석 참조).
 */
export function ServiceWorkerMount() {
  useEffect(() => {
    if (checkPushSupport().kind === 'unsupported') return;
    void registerServiceWorker();
  }, []);
  return null;
}
