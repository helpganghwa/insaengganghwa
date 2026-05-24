'use client';

/**
 * 브라우저 측 PWA Push 헬퍼 — Service Worker 등록 + 권한 요청 + 구독 등록/해제.
 *
 * 권한 요청은 첫 강화 큐 등록 직후 contextual prompt 시점에만 호출(GDD §3.10 v1).
 * 즉시 호출 금지(첫 방문 권한 요청은 70%+ 거부).
 */

const SW_PATH = '/sw.js';

export type PushSupportStatus =
  | { kind: 'supported'; permission: NotificationPermission }
  | { kind: 'unsupported'; reason: 'no-window' | 'no-sw' | 'no-push' | 'no-notification' }
  | { kind: 'ios-needs-install'; permission: 'default' };

/** 환경 감지 — iOS Safari는 PWA(standalone) 모드일 때만 푸시 가능. */
export function checkPushSupport(): PushSupportStatus {
  if (typeof window === 'undefined') return { kind: 'unsupported', reason: 'no-window' };
  if (!('serviceWorker' in navigator)) return { kind: 'unsupported', reason: 'no-sw' };
  if (!('PushManager' in window)) return { kind: 'unsupported', reason: 'no-push' };
  if (!('Notification' in window)) return { kind: 'unsupported', reason: 'no-notification' };

  // iOS Safari는 standalone(홈 화면 추가)이 아니면 푸시 불가
  const ua = navigator.userAgent;
  const isiOS = /iPad|iPhone|iPod/.test(ua);
  // navigator.standalone은 iOS 전용 deprecated API (PWA 식별)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  if (isiOS && !isStandalone) {
    return { kind: 'ios-needs-install', permission: 'default' };
  }
  return { kind: 'supported', permission: Notification.permission };
}

/** SW 등록(idempotent). 이미 등록되어 있으면 같은 등록 반환. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register(SW_PATH);
    // ready를 기다려야 pushManager.subscribe 호출 가능
    await navigator.serviceWorker.ready;
    return reg;
  } catch (e) {
    console.warn('[push] SW register failed', e);
    return null;
  }
}

/** base64url(VAPID public key) → ArrayBuffer. PushManager.subscribe 요구 포맷(BufferSource). */
function urlBase64ToBuffer(b64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

export type SubscribeResult =
  | { kind: 'ok'; subscription: PushSubscription }
  | { kind: 'denied' }
  | { kind: 'error'; message: string };

/**
 * 권한 요청 + 구독 생성. 권한 'granted'면 PushManager.subscribe 호출.
 * 결과는 호출자가 server action으로 DB에 등록한다.
 */
export async function requestAndSubscribe(vapidPublicKey: string): Promise<SubscribeResult> {
  const support = checkPushSupport();
  if (support.kind !== 'supported') {
    return { kind: 'error', message: `unsupported: ${support.kind}` };
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { kind: 'denied' };

    const reg = await registerServiceWorker();
    if (!reg) return { kind: 'error', message: 'sw-register-failed' };

    // 기존 구독이 있으면 재사용(idempotent — 백엔드도 endpoint UNIQUE).
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(vapidPublicKey),
      });
    }
    return { kind: 'ok', subscription: sub };
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'unknown' };
  }
}

/** PushSubscription → 서버 전송용 직렬화. */
export function serializeSubscription(sub: PushSubscription): {
  endpoint: string;
  p256dh: string;
  auth: string;
} {
  const json = sub.toJSON();
  return {
    endpoint: json.endpoint!,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
  };
}

/** 구독 해제 — SW의 구독을 풀고 백엔드에서 DELETE는 호출자가 별도 처리. */
export async function unsubscribe(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return true;
    return await sub.unsubscribe();
  } catch {
    return false;
  }
}
