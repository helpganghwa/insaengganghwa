'use client';

import { useState } from 'react';

import { useAppInstall } from './useAppInstall';
import { InstallGuideModal } from './InstallGuideModal';

/**
 * 헤더 위 전체폭 설치 권유 띠지 — 웹(비설치) 실행 시 모든 화면 상시 노출.
 *  - 설치됨(standalone)·미지원이면 숨김. 닫으면 N일 뒤 재노출.
 *  - 플랫폼별 분기:
 *    · 안드/데스크톱 크롬 = 네이티브 설치 프롬프트
 *    · iOS Safari = 홈 화면 추가 안내
 *    · iOS 비-Safari(Chrome/인앱) = Safari로 열기(설치는 Safari에서만 가능)
 *    · 안드 인앱 웹뷰 = Chrome으로 열기
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
    state.kind === 'ios-safari' ||
    state.kind === 'ios-other' ||
    state.kind === 'android' ||
    state.kind === 'inapp';
  if (hidden || !showable) return null;

  const { label, cta } =
    state.kind === 'ios-other'
      ? { label: 'Safari로 열면 앱으로 설치할 수 있어요', cta: '열기' }
      : state.kind === 'inapp'
        ? { label: 'Chrome으로 열면 앱으로 설치할 수 있어요', cta: '열기' }
        : { label: '앱으로 설치하면 더 빠르게 즐길 수 있어요', cta: '설치' };

  const onInstall = async () => {
    const r = await install();
    if (r === 'guide') setGuide(state.kind === 'ios-safari' ? 'ios' : 'android');
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
      {/* 차분한 블랙톤 시스템 바 — 다크 셸에 녹는 중립 톤 + 미세 보더. 무채색 통일. */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-white/[0.06] bg-zinc-950/90 px-3.5 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="flex min-w-0 flex-1 items-center gap-2 py-2">
          <span className="shrink-0 text-[13px] leading-none opacity-80">📲</span>
          <span className="truncate text-[12px] text-zinc-300">{label}</span>
        </div>
        <button
          type="button"
          onClick={onInstall}
          className="my-1.5 shrink-0 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-zinc-100 transition active:scale-95"
        >
          {cta}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="닫기"
          className="-mr-1 shrink-0 px-1.5 py-2 text-[12px] text-zinc-500 transition active:text-zinc-300"
        >
          ✕
        </button>
      </div>
      {guide ? <InstallGuideModal platform={guide} onClose={() => setGuide(null)} /> : null}
    </>
  );
}
