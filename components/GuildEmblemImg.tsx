'use client';

import { useState } from 'react';

/**
 * 길드 문양 이미지 — 로드 실패 시 폴백(방패 실루엣)으로 바꿔 그린다(2026-09-14).
 * 과거 회차·연대기는 "그 시점 문양 URL"을 박제해 두는데, 파일이 사라진 URL(옛 보관함 삭제)은
 * 브라우저의 깨진 이미지 아이콘으로 떠서 마크가 망가진 것처럼 보였다. GuildBadge 전용 — 셸은
 * 서버 컴포넌트에서도 쓰이므로 onError가 필요한 이 조각만 클라이언트로 뗀다.
 */
export function GuildEmblemImg({
  src,
  size,
  fallback,
  className = '',
}: {
  src: string;
  size: number;
  fallback: React.ReactNode;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (broken) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      className={className}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
    />
  );
}
