'use client';

import { useEffect, useState, useTransition } from 'react';

import {
  checkPushSupport,
  requestAndSubscribe,
  serializeSubscription,
  unsubscribe,
} from '@/lib/push/client';
import {
  registerPushSubscriptionAction,
  setPushCategoryAction,
  setPushEnhanceModeAction,
  unregisterPushSubscriptionAction,
} from '@/lib/push/actions';

/**
 * 설정 페이지의 푸시 토글 그룹.
 *
 * 상태:
 *  1) 미지원 (no SW/PushManager) — "사용 불가" 안내
 *  2) iOS 비-PWA — "홈 화면에 추가" 가이드
 *  3) 권한 default — "알림 받기" 버튼 + 카테고리 토글 비활성
 *  4) 권한 granted + 구독 있음 — 카테고리 토글 활성 + "끄기" 버튼
 *  5) 권한 denied — "브라우저 설정에서 허용 필요" 안내
 *
 * 카테고리 토글 OFF는 즉시 DB 반영(낙관적 UI).
 */

type Cat = 'enhance' | 'raid' | 'supply';

type EnhanceMode = 'instant' | 'batched' | 'batched_1h';

export function PushSettings(props: {
  initialEnhance: boolean;
  initialRaid: boolean;
  initialSupply: boolean;
  initialEnhanceMode: EnhanceMode;
}) {
  const [supportKind, setSupportKind] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [hasSubscription, setHasSubscription] = useState<boolean>(false);
  const [enhance, setEnhance] = useState(props.initialEnhance);
  const [raid, setRaid] = useState(props.initialRaid);
  const [supply, setSupply] = useState(props.initialSupply);
  const [enhanceMode, setEnhanceMode] = useState<EnhanceMode>(props.initialEnhanceMode);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const support = checkPushSupport();
    setSupportKind(support.kind);
    if (support.kind === 'supported') {
      setPermission(support.permission);
      // 현재 구독 여부 확인
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.pushManager.getSubscription())
        .then((sub) => setHasSubscription(!!sub))
        .catch(() => setHasSubscription(false));
    }
  }, []);

  async function enable() {
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) return;
    const r = await requestAndSubscribe(vapid);
    if (r.kind === 'ok') {
      const payload = serializeSubscription(r.subscription);
      await registerPushSubscriptionAction({ ...payload, userAgent: navigator.userAgent });
      setPermission('granted');
      setHasSubscription(true);
    } else if (r.kind === 'denied') {
      setPermission('denied');
    }
  }

  async function disable() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unregisterPushSubscriptionAction({ endpoint: sub.endpoint });
      }
      await unsubscribe();
    } finally {
      setHasSubscription(false);
    }
  }

  function flip(cat: Cat, next: boolean) {
    const setLocal = cat === 'enhance' ? setEnhance : cat === 'raid' ? setRaid : setSupply;
    setLocal(next);
    startTransition(async () => {
      const r = await setPushCategoryAction({ category: cat, enabled: next });
      if (!r.ok) setLocal(!next); // 실패 시 롤백
    });
  }

  if (supportKind === null) {
    return <p className="px-3 py-2.5 text-[11px] text-zinc-500">불러오는 중…</p>;
  }
  if (supportKind === 'unsupported') {
    return (
      <p className="px-3 py-2.5 text-[11px] text-zinc-500">
        이 브라우저는 푸시 알림을 지원하지 않아요.
      </p>
    );
  }
  if (supportKind === 'ios-needs-install') {
    return (
      <div className="px-3 py-2.5 text-[11px] leading-relaxed text-zinc-500">
        iPhone Safari는 홈 화면에 추가한 PWA에서만 푸시를 받을 수 있어요.
        <br />
        Safari 공유 → "홈 화면에 추가" 후 홈 아이콘으로 다시 들어와 주세요.
      </div>
    );
  }

  const togglesDisabled = permission !== 'granted' || !hasSubscription;

  function pickMode(next: EnhanceMode) {
    const prev = enhanceMode;
    setEnhanceMode(next);
    startTransition(async () => {
      const r = await setPushEnhanceModeAction({ mode: next });
      if (!r.ok) setEnhanceMode(prev);
    });
  }

  const modeHint =
    enhanceMode === 'instant'
      ? '슬롯마다 즉시 알림'
      : enhanceMode === 'batched'
        ? '30분 묶음 알림'
        : '1시간 묶음 알림';

  return (
    <div className="space-y-1">
      {permission === 'denied' ? (
        <p className="px-3 py-2.5 text-[11px] leading-relaxed text-amber-600">
          브라우저에서 알림이 차단되어 있어요. 사이트 설정에서 알림을 허용한 뒤 다시 이 페이지에
          들어와 주세요.
        </p>
      ) : (
        <Toggle
          label="알림 받기"
          hint={hasSubscription ? '이 기기에서 알림 수신 중' : '이 기기에서 푸시 알림 받기'}
          on={hasSubscription}
          onChange={(v) => (v ? enable() : disable())}
        />
      )}

      <Toggle
        label="강화 완료"
        hint={modeHint}
        on={enhance}
        disabled={togglesDisabled || pending}
        onChange={(v) => flip('enhance', v)}
      />
      {enhance ? (
        <div className="-mt-1 mb-1 flex gap-1 px-3 text-[10px]">
          {(
            [
              { v: 'instant', label: '즉시' },
              { v: 'batched', label: '30분 묶음' },
              { v: 'batched_1h', label: '1시간 묶음' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.v}
              type="button"
              disabled={togglesDisabled || pending}
              onClick={() => pickMode(opt.v)}
              className={`rounded-full px-2 py-0.5 ${enhanceMode === opt.v ? 'bg-emerald-500 text-white' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
      <Toggle
        label="레이드 종료"
        hint="6시간 만료 후 보상 안내"
        on={raid}
        disabled={togglesDisabled || pending}
        onChange={(v) => flip('raid', v)}
      />
      <Toggle
        label="일일 보급 충전"
        hint="매일 자정(KST) 보급 상자 도착"
        on={supply}
        disabled={togglesDisabled || pending}
        onChange={(v) => flip('supply', v)}
      />
    </div>
  );
}

function Toggle({
  label,
  hint,
  on,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      disabled={disabled}
      className="flex w-full items-center justify-between px-3 py-2.5 text-left disabled:opacity-50"
    >
      <span className="flex flex-col">
        <span className="text-sm">{label}</span>
        {hint ? <span className="text-[11px] text-zinc-500">{hint}</span> : null}
      </span>
      <span
        aria-hidden
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          on ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${
            on ? 'translate-x-4' : ''
          }`}
        />
      </span>
    </button>
  );
}
