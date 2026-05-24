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

export function PushSettings(props: {
  initialEnhance: boolean;
  initialRaid: boolean;
  initialSupply: boolean;
}) {
  const [supportKind, setSupportKind] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [hasSubscription, setHasSubscription] = useState<boolean>(false);
  const [enhance, setEnhance] = useState(props.initialEnhance);
  const [raid, setRaid] = useState(props.initialRaid);
  const [supply, setSupply] = useState(props.initialSupply);
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

  return (
    <div className="space-y-1">
      {permission === 'denied' ? (
        <p className="px-3 py-2.5 text-[11px] leading-relaxed text-amber-600">
          브라우저에서 알림이 차단되어 있어요. 사이트 설정에서 알림을 허용한 뒤 다시 이 페이지에
          들어와 주세요.
        </p>
      ) : !hasSubscription ? (
        <button
          type="button"
          onClick={enable}
          className="mx-3 my-2 rounded-xl bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white"
        >
          🔔 알림 받기
        </button>
      ) : (
        <button
          type="button"
          onClick={disable}
          className="mx-3 my-2 rounded-xl border border-zinc-300 px-3 py-2 text-[12px] font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          알림 끄기 (이 기기)
        </button>
      )}

      <Toggle
        label="강화 완료"
        hint="30분 간격 그룹 알림 — '강화 N건 완료'"
        on={enhance}
        disabled={togglesDisabled || pending}
        onChange={(v) => flip('enhance', v)}
      />
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
