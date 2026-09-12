'use client';

import { useTransition, type ReactNode } from 'react';

import { signOut } from '@/lib/auth/actions';
import { unregisterPushSubscriptionAction } from '@/lib/push/actions';

/**
 * 로그아웃 — **이 기기의 알림 구독을 먼저 끊고** 세션을 닫는다(2026-09-12 6차 검수).
 *
 * 종전엔 로그아웃해도 push_subscriptions 행이 그대로라 그 기기로 이전 계정 알림(강화 완료·
 * 귓속말·우편)이 계속 갔다. 같은 기기에서 다른 계정으로 로그인해도 PushAutoSync가 세션 표식
 * (`push_synced`)을 보고 조기 종료해 구독 주인이 안 바뀌었고, 그래서 **새 계정은 알림을 못 받고
 * 이전 계정은 계속 받는** 상태가 됐다.
 *
 * 브라우저 쪽 구독 자체는 해제하지 않는다 — 다음 로그인 때 PushAutoSync가 같은 구독을 그대로
 * 주워 새 계정으로 등록하므로, 권한을 다시 묻지 않고도 주인만 깔끔히 넘어간다.
 *
 * 정리에 실패해도 로그아웃은 반드시 진행한다. 알림이 조금 새는 것보다 세션이 안 닫히는 쪽이 나쁘다.
 */

/**
 * 로그아웃 시 비우는 세션 표식 — **계정 축**의 판단만 담는다.
 *  - push_synced: 이 세션에서 구독을 서버와 맞췄는가(다음 로그인이 새 주인으로 다시 맞춰야 한다)
 *  - ig:checkin-dismissed: 출석 팝업을 닫았는가(다음 사람에게 적용되면 안 된다)
 * `ig_app`은 앱이 연 화면인가라는 **기기/브라우징 컨텍스트** 사실이라 로그아웃과 무관하다.
 */
const ACCOUNT_SESSION_KEYS = ['push_synced', 'ig:checkin-dismissed'];

export function SignOutButton({ className, children }: { className?: string; children: ReactNode }) {
  const [pending, startTransition] = useTransition();

  const handle = () => {
    if (pending) return;
    startTransition(async () => {
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) await unregisterPushSubscriptionAction({ endpoint: sub.endpoint });
      } catch {
        // 서비스워커 없음·저장소 차단 등 — 무시하고 로그아웃으로 넘어간다.
      }
      // 계정에 딸린 세션 표식은 지운다 — 같은 탭에서 다른 계정이 로그인하면 앞 계정의 판단이
      // 그대로 적용된다. `ig_app`(앱 진입 표식)은 **기기** 맥락이라 남긴다.
      for (const k of ACCOUNT_SESSION_KEYS) {
        try {
          sessionStorage.removeItem(k);
        } catch {
          // noop
        }
      }
      await signOut();
    });
  };

  return (
    <button type="button" onClick={handle} disabled={pending} className={className}>
      {children}
    </button>
  );
}
