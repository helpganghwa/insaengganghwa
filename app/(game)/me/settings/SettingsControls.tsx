'use client';

import { useEffect, useState } from 'react';

/**
 * 로컬 환경설정 토글 — 브라우저 localStorage에만 저장(기기별).
 * 실제 사운드 재생/푸시 전송 연동은 후속(사운드 엔진·웹푸시 미구현).
 */
export function LocalToggle({
  storageKey,
  label,
  hint,
  defaultOn = true,
}: {
  storageKey: string;
  label: string;
  hint?: string;
  defaultOn?: boolean;
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
    localStorage.setItem(storageKey, next ? '1' : '0');
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
