'use client';

import { useEffect } from 'react';

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
