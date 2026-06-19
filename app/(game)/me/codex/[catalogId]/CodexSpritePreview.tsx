'use client';

import { useState } from 'react';

import { TranscendSprite } from '@/components/TranscendSprite';
import type { Slot } from '@/lib/db/schema/equipment';

/**
 * 도감 상세 아이템 프리뷰 — 우측 하단 해방 ON/OFF 스위치.
 *  - ON  : 해방 연출(후광 + 애니메이션, 애니 보유 시 재생)
 *  - OFF : 정적 이미지
 * championRank=1로 해방 동적 경로 진입, animate로 재생 토글. key로 remount해 경로 전환 정리.
 */
export function CodexSpritePreview({ code, slot, size = 144 }: { code: string; slot: Slot; size?: number }) {
  const [lib, setLib] = useState(false);
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <div className="flex h-full w-full items-center justify-center">
        <TranscendSprite
          key={lib ? 'on' : 'off'}
          code={code}
          slot={slot}
          level={0}
          size={size}
          frameless
          championRank={lib ? 1 : null}
          animate={lib}
        />
      </div>
      <button
        type="button"
        onClick={() => setLib((v) => !v)}
        aria-pressed={lib}
        aria-label={`해방 ${lib ? '켜짐' : '꺼짐'}`}
        className={`absolute bottom-0 right-0 z-10 rounded-full border px-2 py-0.5 text-[10px] font-bold transition active:scale-95 ${
          lib
            ? 'border-amber-500 bg-amber-500/15 text-amber-500'
            : 'border-zinc-300 text-zinc-400 dark:border-zinc-700'
        }`}
      >
        해방 {lib ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}
