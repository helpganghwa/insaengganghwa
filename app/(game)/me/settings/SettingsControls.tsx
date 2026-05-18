'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

/** 화면 테마 — next-themes(클래스 토글, globals.css @custom-variant dark와 매칭). */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const opts = [
    { v: 'light', label: '라이트' },
    { v: 'dark', label: '다크' },
    { v: 'system', label: '시스템' },
  ] as const;
  const current = mounted ? (theme ?? 'system') : 'system';

  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-sm">화면 테마</span>
      <div className="flex gap-1 rounded-full bg-zinc-100 p-0.5 dark:bg-zinc-800">
        {opts.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setTheme(o.v)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              current === o.v
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
                : 'text-zinc-500'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const v = localStorage.getItem(storageKey);
    if (v != null) setOn(v === '1');
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
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          mounted && on ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            mounted && on ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}
