'use client';

import { useEffect, useState } from 'react';

import { InstallGuideModal } from '@/components/install/InstallGuideModal';
import {
  checkPushSupport,
  registerServiceWorker,
  requestAndSubscribe,
  serializeSubscription,
} from '@/lib/push/client';
import { registerOpenAlertSubscriptionAction } from '@/lib/push/actions';

const DONE_KEY = 'ig:open-alert-subscribed';

/**
 * 오픈 알림 받기(0145) — CBT 종료 화면 전용. 로그아웃 상태라 익명 구독으로 저장하고,
 * 오픈일에 전 구독 브로드캐스트(scripts/open-push-broadcast.ts)로 알린다.
 * iOS는 홈 화면 설치가 선행 조건 — 설치 안내 모달(기존 컴포넌트)로 잇는다.
 */
export function OpenAlertSection() {
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'denied' | 'unsupported'>(
    'idle',
  );
  const [iosGuide, setIosGuide] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DONE_KEY)) setState('done');
    } catch {
      // 저장소 불가 — 상태 복원만 생략
    }
  }, []);

  const subscribe = async () => {
    const support = checkPushSupport();
    if (support.kind === 'unsupported') {
      setState('unsupported');
      return;
    }
    if (support.kind === 'ios-needs-install') {
      setIosGuide(true);
      return;
    }
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) {
      setState('unsupported');
      return;
    }
    setState('pending');
    try {
      await registerServiceWorker();
      const r = await requestAndSubscribe(vapid);
      if (r.kind !== 'ok') {
        setState(r.kind === 'denied' ? 'denied' : 'idle');
        return;
      }
      const payload = serializeSubscription(r.subscription);
      const res = await registerOpenAlertSubscriptionAction({
        ...payload,
        userAgent: navigator.userAgent,
      });
      if (!res.ok) {
        setState('idle');
        return;
      }
      try {
        localStorage.setItem(DONE_KEY, '1');
      } catch {
        // 저장 실패 시 다음 방문에 버튼이 다시 보일 뿐(구독은 endpoint 멱등)
      }
      setState('done');
    } catch {
      setState('idle');
    }
  };

  return (
    <div className="text-center">
      {state === 'done' ? (
        <p className="text-[12px] leading-relaxed text-amber-300/90">
          오픈 알림 신청 완료 — 문이 열리는 순간 알려드릴게요.
        </p>
      ) : (
        <>
          {/* 고스트 필 — 채움 앰버는 카운트다운보다 시선을 끌어 위계를 깼다(2026-07-31 피드백).
              외곽선+반투명 텍스트로 낮추되, 종료 화면의 유일한 행동이라 찾기는 쉽게 유지. */}
          <button
            type="button"
            onClick={subscribe}
            disabled={state === 'pending'}
            className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-black/25 px-4 py-1.5 text-[11.5px] font-semibold text-amber-300/90 backdrop-blur-[2px] transition active:scale-95 disabled:opacity-60"
          >
            {state === 'pending' ? '신청 중…' : '🔔 오픈 알림 받기'}
          </button>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-zinc-500">
            {state === 'denied'
              ? '알림이 차단되어 있어요 — 브라우저 설정에서 허용 후 다시 눌러 주세요.'
              : state === 'unsupported'
                ? '이 브라우저는 알림을 지원하지 않아요. 앱 설치 후 이용해 주세요.'
                : '알림을 켜두면 오픈 소식을 보내드려요.'}
          </p>
        </>
      )}
      {iosGuide ? <InstallGuideModal platform="ios" onClose={() => setIosGuide(false)} /> : null}
    </div>
  );
}
