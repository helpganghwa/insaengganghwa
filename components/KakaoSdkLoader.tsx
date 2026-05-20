'use client';

import Script from 'next/script';

/**
 * Kakao JavaScript SDK 로더 + init. (game) layout에 1회 마운트.
 * NEXT_PUBLIC_KAKAO_JS_KEY 없으면 silent skip(개발 환경 안전).
 *
 * SDK 로드 후 window.Kakao.init(key). BoastModal에서 Kakao.Share.sendDefault
 * 사용 — imageUrl을 매 호출마다 동적으로 지정해 카톡 캐시 우회.
 */
const KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
const SDK_INTEGRITY = 'sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nka';

export function KakaoSdkLoader() {
  if (!KEY) return null;
  return (
    <Script
      src={SDK_URL}
      integrity={SDK_INTEGRITY}
      crossOrigin="anonymous"
      strategy="afterInteractive"
      onLoad={() => {
        type K = { init: (k: string) => void; isInitialized: () => boolean };
        const k = (window as unknown as { Kakao?: K }).Kakao;
        if (k && !k.isInitialized()) k.init(KEY);
      }}
    />
  );
}
