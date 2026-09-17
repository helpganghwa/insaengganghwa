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
 * 인라인 길드 표식(2026-09-17, 역사 페이지) — 지도 타일과 같은 작은 타일(길드색 바탕 + 머리글자 위 문양) + 길드색 굵은 이름.
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
  return (
    <span className={`inline whitespace-nowrap ${className}`}>
      <span
        aria-hidden
        className="relative mr-[3px] inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[3px] align-[-2px]"
        style={{
          width: size,
          height: size,
          backgroundColor: `color-mix(in srgb, ${gc} 40%, #fdfaf3)`,
          boxShadow: `0 0 0 1px ${gc}`,
        }}
      >
        <span
          className="absolute inset-0 flex items-center justify-center text-[7px] leading-none font-black"
          style={{ color: gc, textShadow: '0 0 1px #fff' }}
        >
          {name.slice(0, 1)}
        </span>
        <EmblemChain
          key={urls[0] ?? 'none'}
          urls={urls}
          className="relative h-full w-full object-contain"
        />
      </span>
      <b className="font-bold" style={{ color: gc }}>
        {shown}
      </b>
    </span>
  );
}
