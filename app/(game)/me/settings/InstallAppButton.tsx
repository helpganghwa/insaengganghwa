'use client';

import { useState } from 'react';

import { useAppInstall } from '@/components/install/useAppInstall';
import { InstallGuideModal } from '@/components/install/InstallGuideModal';

/**
 * 설정 화면 PWA 설치 행 — 감지·핸들러·안내모달은 공용(useAppInstall + InstallGuideModal).
 * 헤더 띠지(InstallStrip)와 동일 로직 공유:
 *  · 안드/데스크톱 크롬 = 네이티브 설치 프롬프트
 *  · iOS Safari = 홈 화면 추가 안내 / iOS 비-Safari = Safari로 열기(설치는 Safari만)
 *  · 안드 인앱 웹뷰 = Chrome으로 열기
 */
export function InstallAppButton() {
  const { state, install } = useAppInstall();
  const [guide, setGuide] = useState<'ios' | 'android' | null>(null);

  if (state.kind === 'installed') {
    return <div className="px-3 py-2.5 text-[11px] text-zinc-500">이미 앱으로 실행 중입니다.</div>;
  }

  const openExternal = state.kind === 'inapp' || state.kind === 'ios-other';
  const disabled = state.kind === 'unsupported' || state.kind === 'idle';

  const handleClick = async () => {
    const r = await install();
    if (r === 'guide') setGuide(state.kind === 'ios-safari' ? 'ios' : 'android');
  };

  const label = openExternal
    ? state.kind === 'ios-other'
      ? '🌐 Safari로 열기 (앱 설치)'
      : '🌐 Chrome으로 열기 (앱 설치)'
    : '📱 홈 화면에 앱으로 추가';

  const status = disabled
    ? '브라우저 미지원'
    : state.kind === 'installable'
      ? '설치'
      : openExternal
        ? '열기'
        : '안내';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm enabled:active:bg-zinc-100 disabled:text-zinc-400 dark:enabled:active:bg-zinc-900"
      >
        <span>{label}</span>
        <span className="text-[11px] text-zinc-400">{status}</span>
      </button>

      {state.kind === 'inapp' ? (
        <p className="px-3 pb-2 text-[11px] leading-relaxed text-zinc-400">
          카카오톡 브라우저에서는 앱 설치가 안 돼요. 위 버튼으로 Chrome에서 열어 설치하세요. 안
          열리면 우측 상단 <strong>⋮ 메뉴 → 다른 브라우저로 열기</strong>를 눌러주세요.
        </p>
      ) : null}
      {state.kind === 'ios-other' ? (
        <p className="px-3 pb-2 text-[11px] leading-relaxed text-zinc-400">
          iOS에서는 <strong>Safari</strong>에서만 홈 화면에 추가(설치)할 수 있어요. 위 버튼으로
          Safari에서 열어 설치하세요.
        </p>
      ) : null}

      {guide ? <InstallGuideModal platform={guide} onClose={() => setGuide(null)} /> : null}
    </>
  );
}
