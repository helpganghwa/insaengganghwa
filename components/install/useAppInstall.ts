'use client';

import { useEffect, useState } from 'react';

// PWA 설치 상태/핸들러 — 헤더 띠지(InstallStrip)·설정 버튼(InstallAppButton) 공용.
//
// iOS 특수성: 홈 화면 추가(설치)는 Safari에서만 가능. Chrome(iOS)·인앱 웹뷰는 전부
// WebKit이지만 Apple이 add-to-home을 Safari로만 허용 → Chrome/인앱에선 설치 불가.
// 따라서 iOS 비-Safari는 "Safari로 열기"로 유도해야 함.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState =
  | { kind: 'idle' } // 감지 중
  | { kind: 'installable'; ev: BeforeInstallPromptEvent } // 네이티브 프롬프트 가능(안드/데스크톱 크롬)
  | { kind: 'installed' } // 이미 standalone
  | { kind: 'ios-safari' } // iOS Safari — 홈 화면 추가 안내
  | { kind: 'ios-other'; kakao: boolean } // iOS 비-Safari(Chrome/인앱) — Safari로 열어야 설치 가능
  | { kind: 'android' } // 안드 but prompt 미발생 — 수동 안내
  | { kind: 'inapp' } // 안드 인앱 웹뷰 — 외부 Chrome으로
  | { kind: 'unsupported' };

/** 안드로이드 인앱 웹뷰 → 외부 Chrome 강제 오픈(intent). */
function openAndroidChrome() {
  const loc = window.location;
  const scheme = loc.protocol.replace(':', '');
  window.location.href =
    `intent://${loc.host}${loc.pathname}${loc.search}` +
    `#Intent;scheme=${scheme};package=com.android.chrome;` +
    `S.browser_fallback_url=${encodeURIComponent(loc.href)};end`;
}

/** iOS 비-Safari(Chrome/인앱) → Safari로 열기. 카카오는 전용 스킴, 그 외는 x-safari-https. */
function openIosSafari(kakao: boolean) {
  const href = window.location.href;
  if (kakao) {
    // KakaoTalk 인앱 → 기본 브라우저(iOS=Safari)로 외부 오픈.
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`;
  } else {
    // Chrome(iOS) 등 → Safari 강제 오픈 스킴.
    window.location.href = href.replace(/^https:\/\//, 'x-safari-https://');
  }
}

export type InstallAction = 'installed' | 'guide' | 'external' | 'none';

export function useAppInstall(): {
  state: InstallState;
  install: () => Promise<InstallAction>;
} {
  const [state, setState] = useState<InstallState>({ kind: 'idle' });

  useEffect(() => {
    // 동기 판정은 effect에서 1회 — 서버·최초 클라 렌더는 idle(null)로 두어 하이드레이션
    // 불일치를 막고, 마운트 후에만 상태를 확정한다.
    const ua = window.navigator.userAgent;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const isIos = /iPhone|iPad|iPod/.test(ua); // CriOS/FxiOS(=iOS Chrome/FF)도 포함
    const kakao = /KAKAOTALK/i.test(ua);
    const otherInApp = /FBAN|FBAV|Instagram|Line\//i.test(ua);

    let sync: InstallState | null = null;
    if (standalone) {
      sync = { kind: 'installed' };
    } else if (isIos) {
      // iOS Safari = add-to-home 가능. 그 외(Chrome/FF/Edge/인앱)는 Safari 유도.
      const nonSafari = kakao || otherInApp || /CriOS|FxiOS|EdgiOS|Whale|NAVER/i.test(ua);
      sync = nonSafari ? { kind: 'ios-other', kakao } : { kind: 'ios-safari' };
    } else if (kakao || otherInApp) {
      sync = { kind: 'inapp' }; // 안드 인앱 → Chrome
    }
    if (sync) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 하이드레이션 안전(마운트 후 1회 확정)
      setState(sync);
      return;
    }

    // 안드/데스크톱 크롬 — beforeinstallprompt 대기, 미발생 시 수동 안내(android)로 폴백.
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
    if (state.kind === 'ios-safari' || state.kind === 'android') return 'guide';
    if (state.kind === 'ios-other') {
      openIosSafari(state.kakao);
      return 'external';
    }
    if (state.kind === 'inapp') {
      openAndroidChrome();
      return 'external';
    }
    return 'none';
  }

  return { state, install };
}
