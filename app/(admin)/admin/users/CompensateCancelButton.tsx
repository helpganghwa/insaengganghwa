'use client';

import { useState, useTransition } from 'react';

import { compensateCancelDamageAction } from './actions';

/** 취소 피해 권장 보상 원클릭 발송 — 금액은 서버가 재계산(여기 표기는 참고용). 2탭 확인. */
export function CompensateCancelButton({ userId, diamond }: { userId: string; diamond: number }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (done) return <p className="mt-2 text-xs font-semibold text-emerald-600">{done}</p>;

  return (
    <button
      type="button"
      disabled={pending || diamond <= 0}
      onClick={() => {
        if (!confirm) {
          setConfirm(true);
          setTimeout(() => setConfirm(false), 3000);
          return;
        }
        start(async () => {
          const r = await compensateCancelDamageAction(userId);
          setDone(
            r.status === 'success'
              ? '보상 우편 발송 완료'
              : r.code === 'NOTHING_TO_COMPENSATE'
                ? '측정 가능한 피해 없음'
                : '발송 실패',
          );
        });
      }}
      className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
    >
      {pending ? '발송 중…' : confirm ? '한 번 더 눌러 확정' : `💎${diamond.toLocaleString('ko-KR')} 보상 우편 발송`}
    </button>
  );
}
