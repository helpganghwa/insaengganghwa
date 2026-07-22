'use client';

import { useRouter } from 'next/navigation';

/**
 * 뒤로가기 공통(2026-07-22, 하이브리드 채택) — GNB가 없는 페이지의 갇힘 해소.
 * PWA standalone·PC는 브라우저 뒤로가기 UI가 없어 앱 내 수단이 필수다.
 * 히스토리가 있으면 이전 화면, 공유 링크 등 직접 진입이면 fallback으로 이동
 * (새 탭/콜드스타트는 history.length=1 — 오탐이어도 홈 이동이라 안전).
 */
function useGoBack(fallback: string): () => void {
  const router = useRouter();
  return () => {
    if (window.history.length > 1) router.back();
    else router.push(fallback);
  };
}

/** A안 — 반투명 유리 원형 ‹ 버튼(몰입형: /u·레이드 전투). 위치는 호출부 className으로 지정. */
export function BackFab({ fallback = '/', className = '' }: { fallback?: string; className?: string }) {
  const goBack = useGoBack(fallback);
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="뒤로가기"
      className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-black/45 pb-0.5 text-xl font-bold leading-none text-white backdrop-blur-sm active:bg-black/60 ${className}`}
    >
      ‹
    </button>
  );
}

/**
 * B안 — 슬림 스티키 바(문서형: 확률 공시·약관·상품 안내).
 * bleed: 부모 패딩(px/py)을 상쇄해 화면 가장자리까지 확장 — 페이지별 패딩에 맞춰 전달.
 */
export function BackBar({
  title,
  fallback = '/',
  bleed = '-mx-4 -mt-5 mb-4',
}: {
  title?: string;
  fallback?: string;
  bleed?: string;
}) {
  const goBack = useGoBack(fallback);
  return (
    <div
      className={`sticky top-0 z-20 flex items-center border-b border-zinc-200 bg-white/90 px-3 py-2 backdrop-blur dark:border-zinc-800 dark:bg-black/85 ${bleed}`}
    >
      <button type="button" onClick={goBack} className="flex items-center gap-1 text-[13px] font-bold">
        <span aria-hidden>←</span> 뒤로
      </button>
      {title ? <span className="ml-auto text-[11px] text-zinc-500">{title}</span> : null}
    </div>
  );
}
