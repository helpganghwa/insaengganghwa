'use client';

import { useEffect, useState } from 'react';

import { ATLAS_CODES, atlasBgStyle } from '@/lib/game/equipment/sprite-atlas';

/**
 * (game) 공통 로딩 UI — 콜드/지연 시 흰 화면(about:blank) 대신 즉시 표시(2026-05-29).
 * RouteTransitionOverlay와 동일한 grow식 비주얼: 아이템 스프라이트(atlas)를 랜덤 순환.
 * 초기값을 첫 코드로 고정 → SSR/hydration 불일치 없이 첫 한 장 즉시 노출(atlas는
 * SpritePreloader가 prefetch). layout 셸(헤더·네비)은 별도로 먼저 뜨고 이 fallback은
 * page 본문 영역에 표시된다.
 */
const CYCLE_MS = 200;
const pick = (prev?: string | null): string | null =>
  ATLAS_CODES[Math.floor(Math.random() * ATLAS_CODES.length)] ?? prev ?? null;

export default function GameLoading() {
  const [code, setCode] = useState<string | null>(() => ATLAS_CODES[0] ?? null);
  useEffect(() => {
    const id = setInterval(() => setCode((p) => pick(p)), CYCLE_MS);
    return () => clearInterval(id);
  }, []);
  const bg = code ? atlasBgStyle(code, 72) : null;
  return (
    <div className="flex flex-1 items-center justify-center py-24" role="status" aria-label="불러오는 중">
      {bg ? <div aria-hidden style={bg} /> : null}
      <span className="sr-only">불러오는 중…</span>
    </div>
  );
}
