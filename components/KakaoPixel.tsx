'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { KAKAO_PIXEL_ID, pixel } from '@/lib/analytics/kakao-pixel';

/**
 * 카카오 픽셀(kp.js) 로더 — 루트 layout에 1회 마운트해 로그인/랜딩 포함 전 페이지를 커버한다.
 * NEXT_PUBLIC_KAKAO_PIXEL_ID 미설정이면 silent skip(개발 환경 안전).
 *
 * 발화 3종:
 *  - pageView : 최초 로드(onLoad) + SPA 라우트 변경(usePathname 변경마다).
 *  - completeRegistration / login : OAuth 콜백이 붙인 ?kakao_ev=signup|login 감지 시 1회.
 *    (콜백이 createdAt 윈도로 신규 가입/기존 로그인을 구분해 파라미터를 지정한다.)
 * 발화 후 URL에서 kakao_ev를 제거해 새로고침 재발화를 막는다.
 */
export function KakaoPixel() {
  const pathname = usePathname();
  const ready = useRef(false);

  // 라우트 변경마다 pageView. 스크립트 로드 전 최초 마운트는 skip(onLoad가 첫 뷰 처리).
  useEffect(() => {
    if (!ready.current) return;
    pixel()?.pageView();
  }, [pathname]);

  if (!KAKAO_PIXEL_ID) return null;

  return (
    <Script
      src="//t1.daumcdn.net/kas/static/kp.js"
      // crossOrigin 없으면 kp.js 내부 예외가 CORS로 잘려 opaque 'Script error.'로만 잡힘
      // (KakaoSdkLoader와 통일 — 진짜 에러 시 상세 노출). daumcdn은 CORS 헤더 제공.
      crossOrigin="anonymous"
      strategy="afterInteractive"
      onLoad={() => {
        ready.current = true;
        const kp = pixel();
        kp?.pageView(); // 최초 진입 pageView

        // OAuth 콜백 전환 — 신규=회원가입(completeRegistration), 기존=로그인(login).
        const ev = new URLSearchParams(window.location.search).get('kakao_ev');
        if (ev === 'signup') kp?.completeRegistration();
        else if (ev === 'login') kp?.login();
        if (ev) {
          const url = new URL(window.location.href);
          url.searchParams.delete('kakao_ev');
          window.history.replaceState(null, '', url.pathname + url.search + url.hash);
        }
      }}
    />
  );
}
