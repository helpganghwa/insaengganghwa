'use client';

import { useState } from 'react';

/** 문양 후보를 차례로 시도(사라진 옛 문양 → 그 길드의 다음 문양). 전부 실패하면 아무것도 그리지 않는다(바탕의 머리글자가 보인다). */
export function EmblemChain({ urls, className }: { urls: readonly string[]; className: string }) {
  const [k, setK] = useState(0);
  const src = urls[k];
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      onError={() => setK((i) => i + 1)}
      className={className}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

/**
 * 인라인 길드 표식(2026-09-17, 역사 페이지) — 12px 문양 이미지 + 길드색 굵은 이름.
 * 연대기 본문·헤드라인에서 길드가 구역보다 먼저 눈에 들어오게 한다. shown = 타이핑 중 일부 텍스트.
 */
export function GuildInline({
  name,
  shown,
  color,
  urls,
  size = 12,
  className = '',
}: {
  name: string;
  shown: string;
  color: string | null;
  urls: readonly string[];
  size?: number;
  className?: string;
}) {
  const gc = color ?? '#4b3a8a';
  // 문양 이미지만(배경·테두리 없음, 2026-09-17 사용자 지시). 문양이 없으면 이름만.
  return (
    <span className={`inline whitespace-nowrap ${className}`} title={name} data-guild={name}>
      {urls.length > 0 ? (
        <span
          aria-hidden
          className="mr-[3px] inline-block align-[-2px]"
          style={{ width: size, height: size }}
        >
          <EmblemChain key={urls[0]} urls={urls} className="h-full w-full object-contain" />
        </span>
      ) : null}
      <b className="font-bold" style={{ color: gc }}>
        {shown}
      </b>
    </span>
  );
}
