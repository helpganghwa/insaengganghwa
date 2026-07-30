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
 * 아이콘 단독 뒤로가기 — 제목 줄에 다른 요소(문양 등)가 이미 있을 때.
 *
 * ⚠ 크기는 **compact 프로퍼티로만** 바꾼다. className에 h-7 같은 걸 넘겨도 소용없다 —
 * Tailwind 유틸은 클래스 속성의 순서가 아니라 **생성된 CSS의 순서**로 이기고, .h-9가
 * .h-7보다 뒤에 있어 항상 h-9가 남는다(2026-07-30, 헤더가 안 줄던 원인).
 *
 * compact는 시각 크기만 24px로 줄이고, 터치 영역은 가상 요소로 넓혀 44px 가까이 유지한다
 * — 줄인 만큼 누르기 어려워지면 안 되니까.
 */
export function BackButton({
  fallback = '/',
  compact = false,
  className = '',
}: {
  fallback?: string;
  /** 한 줄 헤더용 축소 크기(24px). 레이아웃 높이를 이 버튼이 정하지 않게 한다. */
  compact?: boolean;
  className?: string;
}) {
  const goBack = useGoBack(fallback);
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="뒤로가기"
      className={
        compact
          ? `relative -ml-1 flex h-6 w-5 shrink-0 items-center justify-center text-[22px] font-bold leading-none text-zinc-400 after:absolute after:-inset-2.5 after:content-[''] ${className}`
          : `-ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg pb-0.5 text-2xl font-bold leading-none text-zinc-400 active:bg-zinc-100 dark:active:bg-zinc-800 ${className}`
      }
    >
      ‹
    </button>
  );
}

/**
 * C안 — **제목 줄 인라인 뒤로가기**(2026-07-30). 별도 띠를 두지 않고 화면 제목 왼쪽에 ‹ 를 붙인다.
 * 띠는 세로 공간을 먹고 제목과 두 줄이 되어, 상세 화면이 많은 영역(길드)에서 낭비가 크다.
 *
 * kicker = 제목 위 작은 컨텍스트 한 줄(선택). right = 제목 줄 오른쪽 슬롯(카운트·액션).
 */
export function BackTitle({
  title,
  kicker,
  right,
  fallback = '/',
  className = '',
}: {
  title: React.ReactNode;
  kicker?: React.ReactNode;
  right?: React.ReactNode;
  fallback?: string;
  className?: string;
}) {
  const goBack = useGoBack(fallback);
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={goBack}
        aria-label="뒤로가기"
        className="-ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg pb-0.5 text-2xl font-bold leading-none text-zinc-400 active:bg-zinc-100 dark:active:bg-zinc-800"
      >
        ‹
      </button>
      <div className="min-w-0 flex-1">
        {kicker ? (
          <p className="text-[10px] font-semibold tracking-wide text-zinc-400">{kicker}</p>
        ) : null}
        <h1 className="truncate text-base font-extrabold leading-tight">{title}</h1>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
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
