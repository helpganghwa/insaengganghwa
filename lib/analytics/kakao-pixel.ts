// 카카오 비즈보드(모먼트) 픽셀 — 광고 전환 추적. 트랙 ID는 env로 주입한다
// (NEXT_PUBLIC_ → 빌드타임 인라인, 값 변경 시 재배포 필요). 미설정(로컬·프리뷰)이면
// 아래 accessor가 항상 null → 전 호출부 no-op이라 개발 환경에서 안전하다.
//
// 공유용 Kakao JS SDK(window.Kakao, components/KakaoSdkLoader)와는 완전히 별개다.
// 픽셀은 window.kakaoPixel 전역(kp.js)을 쓰며, 로그인/랜딩 포함 전 페이지에서 로드된다.
export const KAKAO_PIXEL_ID = process.env.NEXT_PUBLIC_KAKAO_PIXEL_ID;

// kp.js가 로드되면 window에 심는 전역 팩토리. 로드 전에는 undefined.
// 카카오 픽셀 표준 이벤트(공식 install 가이드) — pageView / completeRegistration / login /
// search / viewContent / addToCart / addToWishList / viewCart / purchase / participation /
// signUp / preparation / tutorial / missionComplete. 여기선 쓰는 3종만 선언.
export interface KakaoPixelInstance {
  pageView: (tag?: string) => void;
  completeRegistration: (tag?: string) => void;
  login: (tag?: string) => void;
}

declare global {
  interface Window {
    kakaoPixel?: (trackId: string) => KakaoPixelInstance;
  }
}

/**
 * 픽셀 인스턴스 반환 — 트랙 ID 미설정이거나 kp.js 로드 전이면 null.
 * 호출부는 `pixel()?.pageView()`처럼 옵셔널 체이닝으로 안전하게 발화한다.
 */
export function pixel(): KakaoPixelInstance | null {
  if (!KAKAO_PIXEL_ID || typeof window === 'undefined') return null;
  const factory = window.kakaoPixel;
  return factory ? factory(KAKAO_PIXEL_ID) : null;
}
