'use client';

import { useTransition, type ReactNode } from 'react';

import { signOut } from '@/lib/auth/actions';
import { unregisterPushSubscriptionAction } from '@/lib/push/actions';

/**
 * 로그아웃 — **이 기기의 알림 구독과 계정 축 표식을 먼저 치우고** 세션을 닫는다(2026-09-12).
 *
 * 종전엔 로그아웃해도 push_subscriptions 행이 그대로라 그 기기로 이전 계정 알림(강화 완료·
 * 귓속말·우편)이 계속 갔다. 같은 기기에서 다른 계정으로 로그인해도 PushAutoSync가 세션 표식
 * (`push_synced`)을 보고 조기 종료해 구독 주인이 안 바뀌었고, 그래서 **새 계정은 알림을 못 받고
 * 이전 계정은 계속 받는** 상태가 됐다.
 *
 * 브라우저 쪽 구독 자체는 해제하지 않는다 — 다음 로그인 때 PushAutoSync가 같은 구독을 그대로
 * 주워 새 계정으로 등록하므로, 권한을 다시 묻지 않고도 주인만 깔끔히 넘어간다.
 */

/** 정리에 쓸 수 있는 시간 — 넘기면 포기하고 로그아웃으로 넘어간다. */
const CLEANUP_TIMEOUT_MS = 2500;

/**
 * 로그아웃 시 비우는 **계정 축** 클라 상태(7차 검수에서 전수 분류).
 *
 * 기기 축(`ig:sound`·`ig:bgm`·`push_optout`·설치 안내 닫음·`ig:chat-collapsed`·`ig_app`·
 * `ig_platform`)은 그대로 둔다 — 사람이 바뀌어도 그 기기의 사실은 그대로다.
 *
 * `tut_step`이 가장 중요하다. 주석이 스스로 "계정·서버 구분 없는 브라우저 키"라고 적어 둔 값인데,
 * 남아 있으면 같은 브라우저에 갓 가입한 계정이 **앞 사람의 튜토리얼 단계부터 시작**해 보급·장착을
 * 건너뛰고, 그 키의 **존재만으로** 채팅 독이 숨고 푸시 권한 요청이 막힌다.
 */
const ACCOUNT_LOCAL_KEYS = [
  'tut_step',
  'tut_step_srv',
  'ig:chat-seen',
  'ig:chat-gid',
  'annSeenAt',
  'ig:seen-items',
  'ig:payack',
  'ig:idvack',
  'chg_app_marked',
];
const ACCOUNT_SESSION_KEYS = ['push_synced', 'ig:checkin-dismissed', 'ig:chat-restore'];
/** 계정 축 접두사 — 서버별로 키가 갈린다. */
const ACCOUNT_LOCAL_PREFIXES = ['ig:chron-read:'];

function clearAccountState(): void {
  for (const k of ACCOUNT_LOCAL_KEYS) {
    try {
      localStorage.removeItem(k);
    } catch {
      // noop
    }
  }
  for (const k of ACCOUNT_SESSION_KEYS) {
    try {
      sessionStorage.removeItem(k);
    } catch {
      // noop
    }
  }
  try {
    for (const k of Object.keys(localStorage)) {
      if (ACCOUNT_LOCAL_PREFIXES.some((p) => k.startsWith(p))) localStorage.removeItem(k);
    }
  } catch {
    // noop
  }
}

export function SignOutButton({ className, children }: { className?: string; children: ReactNode }) {
  const [pending, startTransition] = useTransition();

  const handle = () => {
    if (pending) return;
    startTransition(async () => {
      // ⚠ 정리는 **시간 안에 끝내거나 포기한다**(7차 검수). try/catch는 거부만 잡고 무응답은 못
      // 잡는다 — 죽어가는 연결이나 점검 중 서버에서 구독 해제가 매달리면 로그아웃에 도달하지
      // 못하고 버튼만 잠긴다. 정지 화면(BanScreen)에서는 유일한 탈출구라 특히 나쁘다.
      await Promise.race([
        (async () => {
          try {
            const reg = await navigator.serviceWorker?.getRegistration();
            const sub = await reg?.pushManager.getSubscription();
            if (sub) await unregisterPushSubscriptionAction({ endpoint: sub.endpoint });
          } catch {
            // 서비스워커 없음·저장소 차단 등 — 무시하고 넘어간다.
          }
        })(),
        new Promise<void>((r) => setTimeout(r, CLEANUP_TIMEOUT_MS)),
      ]);
      clearAccountState(); // 동기 — 매달릴 일이 없다
      await signOut();
    });
  };

  return (
    <button type="button" onClick={handle} disabled={pending} className={className}>
      {children}
    </button>
  );
}
