'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { registerPushSubscriptionAction } from '@/lib/push/actions';
import { checkPushSupport, requestAndSubscribe, serializeSubscription } from '@/lib/push/client';

/**
 * 권한이 이미 granted인 기기의 푸시 구독을 앱 로드 시 서버에 (재)동기화한다.
 *
 * 배경: 서버 push_subscriptions가 비면(예: DB 초기화·구독 유실) 브라우저는 권한·구독이
 * 살아 있어 재구독을 스킵 → 서버엔 0건이라 푸시가 안 간다. 기존엔 좁은 trigger(첫 강화 등)
 * 나 알림 수동 토글로만 재등록돼 사각지대가 컸다. 이 컴포넌트가 매 로드 시(세션 1회) 멱등
 * upsert로 서버 구독을 자동 복구한다. 권한이 없으면(default/denied) 아무것도 하지 않음 —
 * 권한 요청은 기존 contextual prompt가 담당(첫 방문 즉시 요청 금지 정책 유지).
 */
export function PushAutoSync() {
  const router = useRouter();

  // SW 알림 클릭 폴백 라우팅 — WindowClient.navigate()가 미제어 클라이언트/iOS PWA에서
  // 실패하면 SW가 postMessage({type:'push-navigate'})로 위임한다(sw.js). 여기서 수신해
  // 소프트 내비게이션. 없으면 알림을 눌러도 마지막 화면이 그대로 보이는 버그가 된다.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: string } | null;
      if (d?.type === 'push-navigate' && typeof d.url === 'string' && d.url.startsWith('/')) {
        router.push(d.url);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [router]);

  // 알림 클릭 목적지 핸드오프 소비 — iOS PWA는 openWindow(url)가 start_url/마지막 화면으로
  // 열려 SW의 어떤 경로로도 목적지가 보장되지 않는 케이스가 있다(실서버 재현). SW가
  // notificationclick 시 IndexedDB('push-nav')에 남긴 목적지를 마운트·포커스 시 읽어 이동.
  useEffect(() => {
    if (!('indexedDB' in window)) return;
    const FRESH_MS = 2 * 60 * 1000; // 클릭 직후만 유효 — 오래된 잔존 항목으로 갑자기 튀는 것 방지
    const consume = () => {
      try {
        const open = indexedDB.open('push-nav', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('kv');
        open.onsuccess = () => {
          try {
            const dbi = open.result;
            const tx = dbi.transaction('kv', 'readwrite');
            const store = tx.objectStore('kv');
            const get = store.get('pending');
            get.onsuccess = () => {
              const v = get.result as { url?: string; ts?: number } | undefined;
              if (v && typeof v.url === 'string' && v.url.startsWith('/')) {
                store.delete('pending');
                if (Date.now() - (v.ts ?? 0) < FRESH_MS && location.pathname !== v.url) {
                  router.push(v.url);
                }
              }
            };
            tx.oncomplete = () => dbi.close();
            tx.onerror = () => dbi.close();
          } catch { /* noop */ }
        };
      } catch { /* noop */ }
    };
    consume();
    const onVisible = () => { if (document.visibilityState === 'visible') consume(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [router]);

  useEffect(() => {
    const support = checkPushSupport();
    if (support.kind !== 'supported' || support.permission !== 'granted') return;
    try {
      if (sessionStorage.getItem('push_synced') === '1') return;
    } catch {
      /* storage 차단 환경 — 그냥 진행 */
    }
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) return;

    let cancelled = false;
    void (async () => {
      try {
        // 이미 granted라 권한 프롬프트는 뜨지 않음 — 기존/신규 구독을 받아 서버에 멱등 등록.
        const r = await requestAndSubscribe(vapid);
        if (cancelled || r.kind !== 'ok') return;
        const payload = serializeSubscription(r.subscription);
        await registerPushSubscriptionAction({ ...payload, userAgent: navigator.userAgent });
        try {
          sessionStorage.setItem('push_synced', '1');
        } catch {
          /* noop */
        }
      } catch (e) {
        console.warn('[push] auto-sync failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
