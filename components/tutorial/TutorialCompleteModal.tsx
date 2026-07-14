'use client';

import { useEffect, useState } from 'react';

import {
  checkPushSupport,
  requestAndSubscribe,
  serializeSubscription,
} from '@/lib/push/client';
import { registerPushSubscriptionAction } from '@/lib/push/actions';
import { InstallAppButton } from '@/app/(game)/me/settings/InstallAppButton';

/**
 * 튜토리얼 마무리 팝업 — 첫 강화 완료 후 1회.
 *  - 알림 가치 제안(강화 최고확률 도달 알림) + 권한 요청
 *  - 앱 설치 안내(PWA)
 *  - 마무리 CTA(인생강화 도전)
 */
type PushState = 'idle' | 'pending' | 'done' | 'error' | 'unsupported';

export function TutorialCompleteModal({ onClose }: { onClose: () => void }) {
  const [push, setPush] = useState<PushState>('idle');

  // 이 팝업이 이미 알림을 안내하므로 강화페이지 프롬프트를 잠시 억제하되, 7일이 아닌
  // **24시간 유예**로(2026-07-14): 여기서 안 켠 다수 유저가 다음날 재방문 때 2차 기회를
  // 받게 — D1 실측(푸시 구독 43% vs 미구독 8% 재방문)에 따른 재방문 루프 강화.
  // (기존 push_dismiss_at(7일)은 명시적 거절 전용으로 남김.)
  useEffect(() => {
    try {
      localStorage.setItem('push_dismiss_until', String(Date.now() + 24 * 60 * 60 * 1000));
    } catch {
      /* localStorage 차단 환경 — 무시 */
    }
  }, []);

  const enablePush = async () => {
    const support = checkPushSupport();
    if (support.kind === 'unsupported' || support.kind === 'ios-needs-install') {
      setPush('unsupported');
      return;
    }
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) {
      setPush('error');
      return;
    }
    setPush('pending');
    const r = await requestAndSubscribe(vapid);
    if (r.kind !== 'ok') {
      setPush('error');
      return;
    }
    await registerPushSubscriptionAction({
      ...serializeSubscription(r.subscription),
      userAgent: navigator.userAgent,
    });
    setPush('done');
  };

  const pushLabel =
    push === 'done'
      ? '🔔 알림 설정 완료'
      : push === 'pending'
        ? '설정 중…'
        : push === 'error'
          ? '⚠️ 알림 설정 실패 — 다시 시도'
          : push === 'unsupported'
            ? '앱 설치 후 알림을 받을 수 있어요'
            : '🔔 강화·보급 알림 받기';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="튜토리얼 완료"
      className="fixed inset-0 z-[62] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
    >
      <div className="w-full max-w-[358px] rounded-2xl bg-white p-5 shadow-[0_0_40px_rgba(245,158,11,0.22)] ring-1 ring-amber-700/40 dark:bg-zinc-900">
        <div className="text-3xl">🎉</div>
        <h2 className="mt-1 text-lg font-extrabold">튜토리얼 완료!</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          첫 강화를 시작했어요. 강화는 시간이 지날수록 성공률이 올라가는데,
          <b className="text-amber-600 dark:text-amber-400"> 최고 확률에 도달하면 알림</b>으로
          알려드릴게요. 앱으로 설치하면 더 편하게 즐길 수 있어요.
        </p>

        <button
          type="button"
          onClick={enablePush}
          disabled={push === 'pending' || push === 'done' || push === 'unsupported'}
          className="mt-4 w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
        >
          {pushLabel}
        </button>

        <div className="mt-2 isolate overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
          <InstallAppButton />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-3 text-[14px] font-extrabold text-amber-950"
        >
          인생강화 계속하기 ⚒️
        </button>
      </div>
    </div>
  );
}
