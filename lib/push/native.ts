'use client';

import { registerApnsTokenAction, unregisterPushSubscriptionAction } from './actions';
import { apnsEndpoint, type ApnsEnv } from './apns-endpoint';

/**
 * 앱스토어 앱(Capacitor) 네이티브 푸시 브리지 — docs/APPSTORE.md §3.4.
 * WKWebView는 웹푸시가 없으므로 셸(mobile/ios)이 `window.__ganghwaPush`를 심고, 웹 코드는
 * 이 브리지로 권한·APNs 토큰을 받아 서버에 등록한다(플러그인 종류는 셸만 안다).
 * 브리지가 없으면(앱 밖) 기존 웹푸시 경로(client.ts)가 그대로 동작한다.
 */
export type NativePushBridge = {
  getPermission(): Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission(): Promise<'granted' | 'denied'>;
  /** 등록된 APNs 기기 토큰(hex)과 빌드 환경. 권한 전이면 null. */
  getToken(): Promise<{ token: string; environment: ApnsEnv } | null>;
};

type BridgeWindow = Window & { __ganghwaPush?: NativePushBridge };

export function nativePushBridge(): NativePushBridge | null {
  if (typeof window === 'undefined') return null;
  const b = (window as BridgeWindow).__ganghwaPush;
  return b && typeof b.getToken === 'function' ? b : null;
}

export function hasNativePushBridge(): boolean {
  return nativePushBridge() !== null;
}

export async function nativePushStatus(): Promise<{ permission: NotificationPermission; hasToken: boolean }> {
  const b = nativePushBridge();
  if (!b) return { permission: 'default', hasToken: false };
  try {
    const p = await b.getPermission();
    const t = p === 'granted' ? await b.getToken() : null;
    return { permission: p === 'prompt' ? 'default' : p, hasToken: !!t };
  } catch {
    return { permission: 'default', hasToken: false };
  }
}

/** 권한 요청 → 토큰 → 서버 등록(멱등 upsert). */
export async function nativePushRegister(): Promise<'granted' | 'denied' | 'error'> {
  const b = nativePushBridge();
  if (!b) return 'error';
  try {
    const p = await b.requestPermission();
    if (p !== 'granted') return 'denied';
    const t = await b.getToken();
    if (!t) return 'error';
    const r = await registerApnsTokenAction({ token: t.token, environment: t.environment, userAgent: navigator.userAgent });
    return r.ok ? 'granted' : 'error';
  } catch {
    return 'error';
  }
}

/** 이미 권한이 있는 기기의 토큰을 서버에 재동기화(앱 로드 시). 권한 없으면 no-op. */
export async function nativePushSyncIfGranted(): Promise<boolean> {
  const b = nativePushBridge();
  if (!b) return false;
  try {
    if ((await b.getPermission()) !== 'granted') return false;
    const t = await b.getToken();
    if (!t) return false;
    const r = await registerApnsTokenAction({ token: t.token, environment: t.environment, userAgent: navigator.userAgent });
    return r.ok;
  } catch {
    return false;
  }
}

/** 이 기기 토큰의 서버 행 삭제(설정 '알림 받기' 끄기). OS 권한은 그대로. */
export async function nativePushUnregister(): Promise<boolean> {
  const b = nativePushBridge();
  if (!b) return false;
  try {
    const t = await b.getToken();
    if (!t) return true;
    const r = await unregisterPushSubscriptionAction({ endpoint: apnsEndpoint(t.environment, t.token) });
    return r.ok;
  } catch {
    return false;
  }
}
