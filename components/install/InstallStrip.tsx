'use client';

import { useState } from 'react';

import { useAppInstall } from './useAppInstall';
import { InstallGuideModal } from './InstallGuideModal';

/**
 * 헤더 위 전체폭 설치 권유 띠지 — 웹(비설치) 실행 시 모든 화면 상시 노출.
 *  - 설치됨(standalone)·미지원이면 숨김. 닫으면 N일 뒤 재노출.
 *  - CTA: 안드/데스크톱 크롬 = 네이티브 설치 프롬프트, iOS = 안내, 카톡 인앱 = Chrome으로 열기.
 */
const DISMISS_KEY = 'install_strip_dismiss_at';
const DISMISS_MS = 5 * 24 * 60 * 60 * 1000; // 5일

export function InstallStrip() {
  const { state, install } = useAppInstall();
  const [guide, setGuide] = useState<'ios' | 'android' | null>(null);
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
      return t > 0 && Date.now() - t < DISMISS_MS;
    } catch {
      return false;
    }
  });

  // 설치 가능/안내 가능한 상태에서만 노출(설치됨·idle·미지원은 숨김).
  const showable =
    state.kind === 'installable' ||
    state.kind === 'ios' ||
    state.kind === 'android' ||
    state.kind === 'inapp';
  if (hidden || !showable) return null;

  const label =
    state.kind === 'inapp' ? '🌐 Chrome으로 열어 앱 설치하기' : '📱 앱으로 설치하고 더 빠르게!';
  const cta = state.kind === 'inapp' ? '열기' : '설치';

  const onInstall = async () => {
    const r = await install();
    if (r === 'guide') setGuide(state.kind === 'ios' ? 'ios' : 'android');
    if (r === 'installed') setHidden(true);
  };

  const onDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* noop */
    }
    setHidden(true);
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 px-3 pt-[env(safe-area-inset-top)] text-amber-950">
        <div className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
          <span className="truncate text-[12px] font-bold">{label}</span>
        </div>
        <button
          type="button"
          onClick={onInstall}
          className="my-1 shrink-0 rounded-full bg-amber-950 px-3 py-1 text-[11px] font-extrabold text-amber-50 active:scale-95"
        >
          {cta}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="닫기"
          className="shrink-0 px-1 py-1.5 text-[13px] font-bold text-amber-950/70"
        >
          ✕
        </button>
      </div>
      {guide ? <InstallGuideModal platform={guide} onClose={() => setGuide(null)} /> : null}
    </>
  );
}
