'use client';

import { useEffect, useState } from 'react';

import {
  checkPushSupport,
  requestAndSubscribe,
  serializeSubscription,
} from '@/lib/push/client';
import { registerPushSubscriptionAction } from '@/lib/push/actions';

/**
 * 푸시 권한 요청 contextual prompt.
 *
 * 표시 정책(GDD §3.10 v1):
 *  - `trigger` prop이 true가 되는 순간(첫 강화 큐 등록 후 등)에만 노출
 *  - 권한 이미 granted = 자동 구독·모달 X
 *  - 권한 denied = 모달 X (재요청은 brand-killing이라 7일 후)
 *  - 거부 후 localStorage 'push_dismiss_at'에 ts 기록 → 7일 내 재노출 X
 *  - iOS Safari + non-PWA = 홈 화면 추가 가이드로 분기
 */

const DISMISS_KEY = 'push_dismiss_at';
const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type Step = 'closed' | 'pitch' | 'ios-guide' | 'success' | 'error';

export function PushPermissionPrompt({
  trigger,
  onDone,
}: {
  trigger: boolean;
  onDone?: () => void;
}) {
  const [step, setStep] = useState<Step>('closed');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!trigger || step !== 'closed') return;
    // 7일 dismiss 윈도
    try {
      const t = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (t > 0 && Date.now() - t < DISMISS_WINDOW_MS) return;
    } catch {
      // localStorage 차단 환경 — 그냥 진행
    }
    const support = checkPushSupport();
    if (support.kind === 'unsupported') return;
    if (support.kind === 'ios-needs-install') {
      setStep('ios-guide');
      return;
    }
    if (support.permission === 'granted') {
      // 이미 권한 있음 — 모달 없이 구독만 보장
      void subscribeAndRegister().then(() => onDone?.());
      return;
    }
    if (support.permission === 'denied') return; // 재요청 X
    setStep('pitch');
  }, [trigger, step, onDone]);

  async function subscribeAndRegister() {
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) {
      console.warn('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY missing');
      return;
    }
    const r = await requestAndSubscribe(vapid);
    if (r.kind !== 'ok') return false;
    const payload = serializeSubscription(r.subscription);
    await registerPushSubscriptionAction({
      ...payload,
      userAgent: navigator.userAgent,
    });
    return true;
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* noop */
    }
    setStep('closed');
    onDone?.();
  }

  if (step === 'closed') return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-[358px] rounded-2xl bg-white p-5 shadow-[0_0_40px_rgba(245,158,11,0.18)] ring-1 ring-amber-700/40 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'pitch' ? (
          <PitchView
            pending={pending}
            onAllow={async () => {
              setPending(true);
              const ok = await subscribeAndRegister();
              setPending(false);
              if (ok) setStep('success');
              else setStep('error');
            }}
            onLater={dismiss}
          />
        ) : null}
        {step === 'ios-guide' ? <IosGuideView onClose={dismiss} /> : null}
        {step === 'success' ? <SuccessView onClose={dismiss} /> : null}
        {step === 'error' ? <ErrorView onClose={dismiss} /> : null}
      </div>
    </div>
  );
}

function PitchView({
  pending,
  onAllow,
  onLater,
}: {
  pending: boolean;
  onAllow: () => void;
  onLater: () => void;
}) {
  return (
    <>
      <div className="mb-2 text-3xl">🔔</div>
      <h2 className="text-base font-bold">강화 결과를 알려드릴까요?</h2>
      <p className="mt-2 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        강화가 끝나면 푸시 알림으로 알려드려요. 30분 단위로 묶어서 보내니 알림이
        너무 자주 오지 않아요. 일일 보급·레이드 정산도 함께 알림 받습니다.
      </p>
      <p className="mt-2 text-[10px] text-zinc-400">
        설정 → 알림에서 카테고리별로 끌 수 있어요.
      </p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onLater}
          disabled={pending}
          className="flex-1 rounded-xl border border-zinc-200 px-3 py-2.5 text-[13px] font-medium text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
        >
          나중에
        </button>
        <button
          type="button"
          onClick={onAllow}
          disabled={pending}
          className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {pending ? '설정 중…' : '알림 받기'}
        </button>
      </div>
    </>
  );
}

function IosGuideView({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="mb-2 text-3xl">📱</div>
      <h2 className="text-base font-bold">iPhone에서는 한 단계 더 필요해요</h2>
      <p className="mt-2 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        iOS Safari는 홈 화면에 추가한 앱에서만 푸시 알림을 받을 수 있어요.
      </p>
      <ol className="mt-3 space-y-1.5 text-[12px] text-zinc-700 dark:text-zinc-200">
        <li>1. Safari 하단 공유 버튼 탭 (↑ 화살표 아이콘)</li>
        <li>2. “홈 화면에 추가” 선택</li>
        <li>3. 홈 화면의 인생강화 아이콘으로 다시 접속</li>
        <li>4. 알림 권한 요청에 동의</li>
      </ol>
      <button
        type="button"
        onClick={onClose}
        className="mt-4 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[13px] font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
      >
        알겠어요
      </button>
    </>
  );
}

function SuccessView({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="mb-2 text-3xl">✅</div>
      <h2 className="text-base font-bold">알림 설정 완료</h2>
      <p className="mt-2 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        강화 결과·레이드 정산·일일 보급 알림을 받을 수 있어요. 언제든 설정에서 끌 수
        있습니다.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-4 w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-[13px] font-bold text-white"
      >
        확인
      </button>
    </>
  );
}

function ErrorView({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="mb-2 text-3xl">⚠️</div>
      <h2 className="text-base font-bold">알림 설정에 실패했어요</h2>
      <p className="mt-2 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        브라우저 알림이 차단되어 있거나 일시 오류가 발생했습니다. 설정에서 다시
        시도할 수 있어요.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-4 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[13px] font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
      >
        닫기
      </button>
    </>
  );
}
