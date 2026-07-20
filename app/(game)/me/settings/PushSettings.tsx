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

// 일일 보급·대난투는 상시 발송(끄기 불가) — 설정 토글에서 제외.
type Cat = 'enhance' | 'raid' | 'profile' | 'referral' | 'chat_mention';

type EnhanceMode = 'instant' | 'batched' | 'batched_1h';

export function PushSettings(props: {
  initialEnhance: boolean;
  initialRaid: boolean;
  initialProfile: boolean;
  initialReferral: boolean;
  initialChatMention: boolean;
  initialEnhanceMode: EnhanceMode;
}) {
  const [supportKind, setSupportKind] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [hasSubscription, setHasSubscription] = useState<boolean>(false);
  // 구독 확인 끝나기 전엔 토글을 그리지 않음 — false→true 전환 시 발생하던
  // OFF→ON 슬라이드 애니메이션(2026-06-01 사용자 지적) 회피. 첫 마운트부터
  // 실제 값(true)으로 렌더되어 transition이 'mount 시점'에 트리거되지 않음.
  const [subChecked, setSubChecked] = useState<boolean>(false);
  const [enhance, setEnhance] = useState(props.initialEnhance);
  const [raid, setRaid] = useState(props.initialRaid);
  const [profile, setProfile] = useState(props.initialProfile);
  const [referral, setReferral] = useState(props.initialReferral);
  const [chatMention, setChatMention] = useState(props.initialChatMention);
  const [enhanceMode, setEnhanceMode] = useState<EnhanceMode>(props.initialEnhanceMode);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const support = checkPushSupport();
    setSupportKind(support.kind);
    if (support.kind === 'supported') {
      setPermission(support.permission);
      // 현재 구독 여부 확인 — 끝나면 subChecked=true로 게이트 해제.
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.pushManager.getSubscription())
        .then((sub) => {
          setHasSubscription(!!sub);
          setSubChecked(true);
        })
        .catch(() => {
          setHasSubscription(false);
          setSubChecked(true);
        });
    } else {
      // 미지원/ios-needs-install — 토글을 안 그리므로 게이트 즉시 해제.
      setSubChecked(true);
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
    const setterMap: Record<Cat, (v: boolean) => void> = {
      enhance: setEnhance,
      raid: setRaid,
      profile: setProfile,
      referral: setReferral,
      chat_mention: setChatMention,
    };
    const setLocal = setterMap[cat];
    setLocal(next);
    startTransition(async () => {
      const r = await setPushCategoryAction({ category: cat, enabled: next });
      if (!r.ok) setLocal(!next); // 실패 시 롤백
    });
  }

  if (supportKind === null || (supportKind === 'supported' && !subChecked)) {
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
        Safari 공유 → “홈 화면에 추가” 후 홈 아이콘으로 다시 들어와 주세요.
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
        label="아바타 생성 결과"
        hint="아바타 검토 완료/반려/실패 알림"
        on={profile}
        disabled={togglesDisabled || pending}
        onChange={(v) => flip('profile', v)}
      />
      <Toggle
        label="친구 초대"
        hint="내 카카오톡 공유로 친구가 가입했을 때"
        on={referral}
        disabled={togglesDisabled || pending}
        onChange={(v) => flip('referral', v)}
      />
      <Toggle
        label="채팅 멘션"
        hint="전체 채팅에서 @닉네임으로 언급됐을 때"
        on={chatMention}
        disabled={togglesDisabled || pending}
        onChange={(v) => flip('chat_mention', v)}
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
