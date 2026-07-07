'use client';

import { useState, useTransition } from 'react';

import { sendRequestAction } from '@/app/(game)/friends/actions';
import type { FriendRelation } from '@/lib/game/friends';

const ERR_MSG: Record<string, string> = {
  RATE_LIMITED: '잠시 후 다시 시도해주세요',
  CAP_REACHED: '친구가 가득 찼습니다 (최대 30명)',
  NOT_FOUND: '유저를 찾을 수 없습니다',
  SELF: '자기 자신에게는 보낼 수 없습니다',
  UNAUTHENTICATED: '로그인이 필요합니다',
  BANNED: '이용이 제한된 계정입니다',
  MAINTENANCE: '점검 중입니다',
  UNKNOWN: '요청에 실패했습니다',
};

/**
 * 프로필 하단 '친구 추가' 버튼 — 실제 동작은 친구 요청(sendRequestAction).
 * initialRelation으로 초기 상태를 그린 뒤, 응답에 따라 낙관적 갱신.
 * 상대가 내게 보낸 요청(incoming)이 있으면 sendRequest가 즉시 수락으로 성립시킨다.
 * relation==='friend'는 부모(page)에서 이미 렌더하지 않지만, 응답으로 friend가 되면 숨김.
 */
export function FriendAddButton({
  targetId,
  initialRelation,
}: {
  targetId: string;
  initialRelation: FriendRelation;
}) {
  const [relation, setRelation] = useState<FriendRelation>(initialRelation);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (relation === 'friend') return null;

  const send = () => {
    setErr(null);
    startTransition(async () => {
      const r = await sendRequestAction(targetId);
      if (r.status === 'error') {
        // 이미 성립한 상태는 에러가 아니라 상태 반영으로 흡수.
        if (r.code === 'ALREADY_FRIEND') return setRelation('friend');
        if (r.code === 'ALREADY_REQUESTED') return setRelation('outgoing');
        setErr(ERR_MSG[r.code] ?? ERR_MSG.UNKNOWN);
        return;
      }
      setRelation(r.result === 'accepted' ? 'friend' : 'outgoing');
    });
  };

  if (relation === 'outgoing') {
    return (
      <div className="flex w-full items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 py-2.5 text-sm font-semibold text-zinc-500">
        친구 요청됨
      </div>
    );
  }

  // none / incoming — incoming이면 클릭 시 요청이 즉시 수락으로 성립.
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={send}
        disabled={pending}
        className={`flex w-full items-center justify-center rounded-xl py-2.5 text-sm font-bold transition active:scale-[0.98] ${
          pending
            ? 'bg-zinc-800 text-zinc-500'
            : 'bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-lg shadow-indigo-900/30'
        }`}
      >
        {relation === 'incoming' ? '친구 요청 수락' : '친구 추가'}
      </button>
      {err && (
        <p className="rounded-lg bg-red-950/40 px-2 py-1 text-center text-xs text-red-300">{err}</p>
      )}
    </div>
  );
}
