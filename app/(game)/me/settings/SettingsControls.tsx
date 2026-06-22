'use client';

import { useEffect, useState } from 'react';

import { setBgmEnabled } from '@/lib/audio/bgm';

/**
 * 로컬 환경설정 토글 — 브라우저 localStorage에만 저장(기기별).
 * 효과음은 재생 시점마다 localStorage를 읽어 라이브 제어가 불필요하지만, BGM은 연속
 * 재생이라 토글 즉시 시작/정지가 필요 → liveControl='bgm'이면 BGM 매니저를 직접 호출.
 */
export function LocalToggle({
  storageKey,
  label,
  hint,
  defaultOn = true,
  liveControl,
}: {
  storageKey: string;
  label: string;
  hint?: string;
  defaultOn?: boolean;
  liveControl?: 'bgm';
}) {
  const [on, setOn] = useState(defaultOn);
  // 최초 페인트엔 transition을 끄고(rAF 후 활성) localStorage 값 적용 시 모션이 안 보이게.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const v = localStorage.getItem(storageKey);
    if (v != null) setOn(v === '1');
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [storageKey]);

  const toggle = () => {
    const next = !on;
    setOn(next);
    if (liveControl === 'bgm') {
      // setBgmEnabled가 localStorage 저장까지 담당(이 클릭이 곧 unlock 제스처).
      setBgmEnabled(next);
    } else {
      localStorage.setItem(storageKey, next ? '1' : '0');
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex w-full items-center justify-between px-3 py-2.5 text-left"
    >
      <span className="flex flex-col">
        <span className="text-sm">{label}</span>
        {hint ? <span className="text-[11px] text-zinc-500">{hint}</span> : null}
      </span>
      <span
        aria-hidden
        className={`relative h-5 w-9 shrink-0 rounded-full ${ready ? 'transition-colors' : ''} ${
          on ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white ${ready ? 'transition-all' : ''} ${
            on ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}
