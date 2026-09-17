'use client';

import { useState } from 'react';

/**
 * 길드 문양 이미지 — 로드 실패 시 폴백(방패 실루엣)으로 바꿔 그린다(2026-09-14).
 * 과거 회차·연대기는 "그 시점 문양 URL"을 박제해 두는데, 파일이 사라진 URL(옛 보관함 삭제)은
 * 브라우저의 깨진 이미지 아이콘으로 떠서 마크가 망가진 것처럼 보였다. GuildBadge·세계지도·점령전
 * 결과가 같이 쓴다 — 셸은 서버 컴포넌트에서도 쓰이므로 onError가 필요한 이 조각만 클라이언트로 뗀다.
 */
export function GuildEmblemImg({
  src,
  alsoTry,
  size,
  fallback = null,
  className = '',
}: {
  src: string;
  /** src가 안 열리면 차례로 시도할 다음 문양들(2026-09-17, 사라진 옛 문양 → 그 길드의 다음 문양). 전부 실패해야 fallback. */
  alsoTry?: readonly string[];
  /** 정사각 px. 생략하면 className의 h-·w- 클래스가 크기를 정한다 — 세계지도 마커·목록용. */
  size?: number;
  /** 로드 실패 시 대신 그릴 것. 생략(null)이면 아무것도 안 그린다(길드 색 박스 등 바탕이 이미 있는 자리). */
  fallback?: React.ReactNode;
  className?: string;
}) {
  const [k, setK] = useState(0);
  const cur = k === 0 ? src : alsoTry?.[k - 1];
  if (!cur) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cur}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      onError={() => setK((i) => i + 1)}
      className={className}
      style={{ ...(size != null ? { width: size, height: size } : {}), imageRendering: 'pixelated' }}
    />
  );
}
