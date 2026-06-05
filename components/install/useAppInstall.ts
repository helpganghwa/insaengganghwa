'use client';

import { useEffect, useState } from 'react';

// PWA 설치 상태/핸들러 — 헤더 띠지(InstallStrip)·설정 버튼(InstallAppButton) 공용.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState =
  | { kind: 'idle' } // 감지 중
  | { kind: 'installable'; ev: BeforeInstallPromptEvent } // 네이티브 프롬프트 가능(안드/데스크톱 크롬)
  | { kind: 'installed' } // 이미 standalone
  | { kind: 'ios' } // iOS Safari — 수동 안내
  | { kind: 'android' } // 안드 but prompt 미발생 — 수동 안내
  | { kind: 'inapp' } // 카카오톡 등 인앱 웹뷰 — 외부 브라우저로
  | { kind: 'unsupported' };

/** 카카오톡 등 인앱 웹뷰 — PWA 설치/푸시 불가. 외부 브라우저(Chrome) 강제 오픈. */
export function openInExternalBrowser() {
  const loc = window.location;
  const ua = window.navigator.userAgent;
  if (/Android/.test(ua)) {
    const scheme = loc.protocol.replace(':', '');
    window.location.href =
      `intent://${loc.host}${loc.pathname}${loc.search}` +
      `#Intent;scheme=${scheme};package=com.android.chrome;` +
      `S.browser_fallback_url=${encodeURIComponent(loc.href)};end`;
  } else {
    const chrome = loc.protocol === 'https:' ? 'googlechromes://' : 'googlechrome://';
    window.location.href = `${chrome}${loc.host}${loc.pathname}${loc.search}`;
  }
}

export type InstallAction = 'installed' | 'guide' | 'external' | 'none';

export function useAppInstall(): {
  state: InstallState;
  install: () => Promise<InstallAction>;
} {
  const [state, setState] = useState<InstallState>({ kind: 'idle' });

  useEffect(() => {
    // 동기 판정(standalone/inapp/ios)은 effect에서 1회 — 서버·최초 클라 렌더는 idle(null)로
    // 두어 하이드레이션 불일치를 막고, 마운트 후에만 상태를 확정한다.
    const ua = window.navigator.userAgent;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const isIos = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    const sync: InstallState | null = standalone
      ? { kind: 'installed' }
      : /KAKAOTALK|FBAN|FBAV|Instagram|Line\//i.test(ua)
        ? { kind: 'inapp' }
        : isIos
          ? { kind: 'ios' }
          : null;
    if (sync) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 하이드레이션 안전(마운트 후 1회 확정)
      setState(sync);
      return;
    }

    const onBeforePrompt = (e: Event) => {
      e.preventDefault();
      setState({ kind: 'installable', ev: e as BeforeInstallPromptEvent });
    };
    const onInstalled = () => setState({ kind: 'installed' });
    window.addEventListener('beforeinstallprompt', onBeforePrompt);
    window.addEventListener('appinstalled', onInstalled);

    const isAndroid = /Android/.test(ua);
    const t = window.setTimeout(() => {
      setState((s) =>
        s.kind === 'idle' ? (isAndroid ? { kind: 'android' } : { kind: 'unsupported' }) : s,
      );
    }, 1800);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforePrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.clearTimeout(t);
    };
  }, []);

  async function install(): Promise<InstallAction> {
    if (state.kind === 'installable') {
      await state.ev.prompt();
      const { outcome } = await state.ev.userChoice;
      if (outcome === 'accepted') {
        setState({ kind: 'installed' });
        return 'installed';
      }
      return 'none';
    }
    if (state.kind === 'ios' || state.kind === 'android') return 'guide';
    if (state.kind === 'inapp') {
      openInExternalBrowser();
      return 'external';
    }
    return 'none';
  }

  return { state, install };
}
