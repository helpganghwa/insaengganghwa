'use client';

import { useEffect, useState } from 'react';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';

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
/** 만료시각 방식 억제 키 — 튜토리얼 완료 모달이 24h 유예를 걸 때 사용(2026-07-14 D1 개선). */
export const DISMISS_UNTIL_KEY = 'push_dismiss_until';

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
    try {
      // 튜토리얼 진행 중엔 절대 미노출 — 코치(z-61)·완료모달(z-62)과 경합 방지(2026-07-14).
      // 완료모달의 알림·설치 안내는 제거됨(2026-07-18: 첫날 앱 미설치 대다수라 너무 이름) —
      // 이 프롬프트(완료모달의 24h 유예 뒤)와 도전 과제(app_install·push_on)가 안내를 전담.
      if (localStorage.getItem('tut_step')) return;
      // 7일 dismiss 윈도(명시적 거절)
      const t = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (t > 0 && Date.now() - t < DISMISS_WINDOW_MS) return;
      // 만료시각 방식 유예(완료모달이 기록한 24h) — 지났으면 키 정리 후 진행.
      const until = Number(localStorage.getItem(DISMISS_UNTIL_KEY) ?? 0);
      if (until > Date.now()) return;
      if (until > 0) localStorage.removeItem(DISMISS_UNTIL_KEY);
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
      void subscribeAndRegister().then(() => onDone?.()).catch(() => {}); // best-effort — 다음 트리거에서 재시도
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

  const allow = async () => {
    setPending(true);
    const ok = await subscribeAndRegister();
    setPending(false);
    setStep(ok ? 'success' : 'error');
  };

  // 단계마다 제목·부제·푸터가 다르다 — 본문 컴포넌트는 설명만 담당한다.
  const HEAD: Record<Exclude<Step, 'closed'>, { title: string; sub: string }> = {
    pitch: { title: '강화 결과를 알려드릴까요?', sub: '30분 단위로 묶어서 보내요' },
    'ios-guide': { title: 'iPhone에서는 한 단계 더 필요해요', sub: '홈 화면에 추가하면 받을 수 있어요' },
    success: { title: '알림 설정 완료', sub: '설정에서 언제든 끌 수 있어요' },
    error: { title: '알림 설정에 실패했어요', sub: '설정에서 다시 시도할 수 있어요' },
  };
  const head = HEAD[step];

  return (
    <ModalShell
      onClose={dismiss}
      onSubmit={step === 'pitch' ? (pending ? undefined : allow) : dismiss}
      label="알림 권한 안내"
    >
      <ModalLayout
        title={head.title}
        subtitle={
          <span className="font-bold text-amber-600 dark:text-amber-400">{head.sub}</span>
        }
        footer={
          step === 'pitch' ? (
            <>
              <ModalButton tone="ghost" onClick={dismiss} disabled={pending}>
                나중에
              </ModalButton>
              <ModalButton tone="success" onClick={allow} disabled={pending}>
                {pending ? '설정 중…' : '알림 받기'}
              </ModalButton>
            </>
          ) : step === 'success' ? (
            <ModalButton tone="success" onClick={dismiss}>
              확인
            </ModalButton>
          ) : (
            <ModalButton tone="ghost" onClick={dismiss}>
              {step === 'ios-guide' ? '알겠어요' : '닫기'}
            </ModalButton>
          )
        }
      >
        {step === 'pitch' ? <PitchView /> : null}
        {step === 'ios-guide' ? <IosGuideView /> : null}
        {step === 'success' ? <SuccessView /> : null}
        {step === 'error' ? <ErrorView /> : null}
      </ModalLayout>
    </ModalShell>
  );
}

function PitchView() {
  return (
    <>
      <p className="text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        강화가 끝나면 푸시 알림으로 알려드려요. 30분 단위로 묶어서 보내니 알림이 너무 자주 오지
        않아요. 일일 보급·레이드 정산도 함께 알림 받습니다.
      </p>
      <p className="mt-2 text-[10.5px] text-zinc-400">
        설정 → 알림에서 카테고리별로 끌 수 있어요.
      </p>
    </>
  );
}

function IosGuideView() {
  return (
    <>
      <p className="text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        iOS Safari는 홈 화면에 추가한 앱에서만 푸시 알림을 받을 수 있어요.
      </p>
      <ol className="mt-3 space-y-1.5 text-[12px] text-zinc-700 dark:text-zinc-200">
        <li>1. 화면 하단 오른쪽 <b>⋯</b> 버튼 탭</li>
        <li>2. <b>공유</b> 선택</li>
        <li>3. 목록을 아래로 내려 <b>홈 화면에 추가</b> 선택</li>
        <li>4. 홈 화면의 인생강화 아이콘으로 접속 후 알림 권한 동의</li>
      </ol>
    </>
  );
}

function SuccessView() {
  return (
    <p className="text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
      강화 결과·레이드 정산·일일 보급 알림을 받을 수 있어요.
    </p>
  );
}

function ErrorView() {
  return (
    <p className="text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
      브라우저 알림이 차단되어 있거나 일시 오류가 발생했습니다. 브라우저 설정에서 알림을 허용한 뒤
      다시 시도해 주세요.
    </p>
  );
}
