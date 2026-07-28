'use client';

import { useEffect, useState } from 'react';

import { atlasBgStyle, ATLAS_CODES } from '@/lib/game/equipment/sprite-atlas';

const CYCLE_MS = 200; // 화면 이동 오버레이와 동일 주기

function pick(prev?: string | null): string | null {
  return ATLAS_CODES[Math.floor(Math.random() * ATLAS_CODES.length)] ?? prev ?? null;
}

/**
 * 로딩 표시 — 화면 이동 오버레이(RouteTransitionOverlay)와 같은 표현.
 * 아이템 스프라이트가 랜덤 순환하는 방식이라 '불러오는 중…' 텍스트나 스피너를 따로 두지 않아도
 * 앱 전체 로딩 톤이 통일된다. atlas 1장을 잘라 쓰므로 추가 요청 없음.
 */
export function SpriteLoading({ size = 56, className = '' }: { size?: number; className?: string }) {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 순환 표시는 마운트 후에만 의미
    setCode((p) => pick(p));
    const id = setInterval(() => setCode((p) => pick(p)), CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  const bg = code ? atlasBgStyle(code, size) : null;
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ minHeight: size }}
      aria-label="불러오는 중"
      role="status"
    >
      {bg ? <div aria-hidden style={bg} /> : null}
    </div>
  );
}

/**
 * 화면 중앙 로딩 오버레이 — 라우트 이동 로딩과 같은 위치·크기·표현.
 * 라우트가 바뀌지 않는 화면 내 데이터 교체(탭 전환 등)에 쓴다.
 */
export function SpriteLoadingOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center">
      <SpriteLoading size={72} />
    </div>
  );
}
