'use client';

import { useState } from 'react';

import { PresetModal } from './PresetModal';

/**
 * 강화 프리셋 플로팅 버튼(10-21, 소서 #492) — 강화 탭에만, 튜토리얼이 끝난 뒤.
 * 채팅 미니바(바텀 내비 위 34px + 여백)와 겹치지 않게 그 위에 띄운다. 폭은 채팅 미니바와 같은 방식으로
 * 390 셸에 맞춘다(fixed inset-x-0 → 안쪽 max-w-[390px]). 글자만(10-21 결정).
 */
export function PresetFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 z-20"
        style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom) + var(--gt-h, 0px) + 52px)' }}
      >
        <div className="mx-auto flex w-full max-w-[390px] justify-end px-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="pointer-events-auto h-10 rounded-full bg-amber-500 px-4 text-[12.5px] font-extrabold text-black shadow-[0_8px_24px_rgba(0,0,0,.45)] transition active:scale-[0.98]"
          >
            프리셋
          </button>
        </div>
      </div>
      {open ? <PresetModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}
