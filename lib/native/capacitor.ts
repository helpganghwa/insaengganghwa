'use client';

import type { NativePushBridge } from '@/lib/push/native';

/**
 * Capacitor 런타임 → 웹 브리지 어댑터 — docs/APPSTORE.md §3.4·§3.5.
 * 앱스토어 앱은 `server.url`로 ganghwa.app을 그대로 띄우고, Capacitor가 WebView에 `window.Capacitor`를
 * 주입한다. 이 모듈은 그 런타임이 있을 때만 표준 플러그인(PushNotifications)으로 `window.__ganghwaPush`를
 * 만들어 웹 코드가 쓰는 브리지 계약을 채운다 — 셸에 별도 JS를 두지 않아도 된다.
 * 결제 브리지(`window.__ganghwaIap`)는 StoreKit 플러그인 확정 후 같은 자리에서 만든다.
 *
 * APNs 환경: TestFlight·App Store 빌드는 production, Xcode에서 직접 설치한 디버그 빌드만 sandbox.
 * 디버그 빌드는 `window.__ganghwaApnsEnv = 'sandbox'`를 먼저 세팅해 두면(셸의 디버그 전용 스크립트) 그 값을 쓴다.
 */

type PermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';
type PushPlugin = {
  checkPermissions(): Promise<{ receive: PermissionState }>;
  requestPermissions(): Promise<{ receive: PermissionState }>;
  register(): Promise<void>;
  addListener(event: 'registration', cb: (t: { value: string }) => void): Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
  addListener(event: 'registrationError', cb: (e: { error: string }) => void): Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
  addListener(
    event: 'pushNotificationActionPerformed',
    cb: (a: { notification: { data?: Record<string, unknown> } }) => void,
  ): Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
};
type CapacitorWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: { PushNotifications?: PushPlugin } };
  __ganghwaPush?: NativePushBridge;
  __ganghwaApnsEnv?: 'sandbox' | 'production';
  __ganghwaBridgesInstalled?: boolean;
};

export function isCapacitorIos(): boolean {
  if (typeof window === 'undefined') return false;
  const c = (window as CapacitorWindow).Capacitor;
  return !!c?.isNativePlatform?.() && c.getPlatform?.() === 'ios';
}

let tokenCache: string | null = null;

/** register() 후 'registration' 이벤트로 오는 APNs 토큰(hex)을 1회 기다린다. 이미 받았으면 캐시. */
async function fetchToken(plugin: PushPlugin): Promise<string | null> {
  if (tokenCache) return tokenCache;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    void Promise.resolve(plugin.addListener('registration', (t) => {
      tokenCache = (t.value || '').toLowerCase();
      finish(tokenCache || null);
    }));
    void Promise.resolve(plugin.addListener('registrationError', () => finish(null)));
    setTimeout(() => finish(null), 10_000);
    plugin.register().catch(() => finish(null));
  });
}

/**
 * 브리지 설치(멱등) — (game) 레이아웃의 클라 컴포넌트가 마운트 시 호출. Capacitor iOS가 아니면 no-op.
 * 알림 탭(pushNotificationActionPerformed)은 payload url로 이동시킨다(웹푸시의 SW push-navigate와 대응).
 */
export function installCapacitorBridges(navigate?: (url: string) => void): void {
  if (!isCapacitorIos()) return;
  const w = window as CapacitorWindow;
  if (w.__ganghwaBridgesInstalled) return;
  const plugin = w.Capacitor?.Plugins?.PushNotifications;
  if (!plugin) return;
  w.__ganghwaBridgesInstalled = true;

  const norm = (p: PermissionState): 'granted' | 'denied' | 'prompt' => (p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'prompt');
  const env = () => w.__ganghwaApnsEnv === 'sandbox' ? 'sandbox' : 'production';

  w.__ganghwaPush = {
    async getPermission() {
      return norm((await plugin.checkPermissions()).receive);
    },
    async requestPermission() {
      const r = norm((await plugin.requestPermissions()).receive);
      return r === 'granted' ? 'granted' : 'denied';
    },
    async getToken() {
      const token = await fetchToken(plugin);
      return token ? { token, environment: env() } : null;
    },
  };

  void Promise.resolve(
    plugin.addListener('pushNotificationActionPerformed', (a) => {
      const url = a.notification?.data?.url;
      if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
        if (navigate) navigate(url);
        else window.location.assign(url);
        window.dispatchEvent(new CustomEvent('ig:push-nav', { detail: url }));
      }
    }),
  );
}
