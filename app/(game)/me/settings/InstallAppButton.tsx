'use client';

import { useEffect, useState } from 'react';

// PWA 설치 — Android/Desktop Chrome 계열은 beforeinstallprompt 받아서 자동.
// iOS Safari는 트리거 API가 없어 안내 다이얼로그(공유 → 홈 화면 추가)만.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type State =
  | { kind: 'idle' }
  | { kind: 'installable'; ev: BeforeInstallPromptEvent }
  | { kind: 'installed' }
  | { kind: 'ios' }
  | { kind: 'unsupported' };

export function InstallAppButton() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [iosOpen, setIosOpen] = useState(false);

  useEffect(() => {
    // 이미 standalone(설치돼 실행 중)이면 안내 자체 숨김
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari standalone 플래그
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) {
      setState({ kind: 'installed' });
      return;
    }

    // iOS Safari는 beforeinstallprompt 미지원 → 안내 모드
    const ua = window.navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIos) {
      setState({ kind: 'ios' });
      return;
    }

    const onBeforePrompt = (e: Event) => {
      e.preventDefault();
      setState({ kind: 'installable', ev: e as BeforeInstallPromptEvent });
    };
    const onInstalled = () => setState({ kind: 'installed' });
    window.addEventListener('beforeinstallprompt', onBeforePrompt);
    window.addEventListener('appinstalled', onInstalled);

    // 이벤트 안 오면 unsupported(이미 설치됐거나 PWA 기준 미충족)
    const t = window.setTimeout(() => {
      setState((s) => (s.kind === 'idle' ? { kind: 'unsupported' } : s));
    }, 1500);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforePrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.clearTimeout(t);
    };
  }, []);

  if (state.kind === 'installed') {
    return (
      <div className="px-3 py-2.5 text-[11px] text-zinc-500">
        이미 앱으로 실행 중입니다.
      </div>
    );
  }

  const handleClick = async () => {
    if (state.kind === 'installable') {
      await state.ev.prompt();
      const { outcome } = await state.ev.userChoice;
      if (outcome === 'accepted') setState({ kind: 'installed' });
    } else if (state.kind === 'ios') {
      setIosOpen(true);
    }
  };

  const label =
    state.kind === 'installable'
      ? '📱 홈 화면에 앱으로 추가'
      : state.kind === 'ios'
        ? '📱 홈 화면에 앱으로 추가 (iOS 안내)'
        : '📱 홈 화면에 앱으로 추가';

  const disabled = state.kind === 'unsupported' || state.kind === 'idle';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm enabled:active:bg-zinc-100 disabled:text-zinc-400 dark:enabled:active:bg-zinc-900"
      >
        <span>{label}</span>
        <span className="text-[11px] text-zinc-400">
          {disabled
            ? '브라우저 미지원'
            : state.kind === 'installable'
              ? '설치'
              : '안내'}
        </span>
      </button>

      {iosOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          onClick={() => setIosOpen(false)}
        >
          <div
            className="m-4 max-w-sm rounded-xl bg-white p-4 text-sm shadow-[0_0_40px_rgba(245,158,11,0.18)] ring-1 ring-amber-700/40 dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-base font-semibold">iOS 홈 화면 추가</h3>
            <ol className="space-y-2 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
              <li>
                1. Safari 하단의 <strong>공유 버튼</strong> <span className="font-mono">⎙</span>
                {' '}탭
              </li>
              <li>
                2. 메뉴에서 <strong>“홈 화면에 추가”</strong> 선택
              </li>
              <li>
                3. 이름 확인 후 우상단 <strong>추가</strong> 탭
              </li>
              <li>4. 홈 화면에서 인생강화 아이콘으로 실행</li>
            </ol>
            <p className="mt-3 text-[11px] text-zinc-500">
              iOS에서는 보안 정책상 버튼으로 자동 설치가 불가능합니다.
            </p>
            <button
              type="button"
              onClick={() => setIosOpen(false)}
              className="mt-4 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              확인
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
