'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { verifyPurchaseAction } from '../../actions';

type State =
  | { kind: 'verifying' }
  | { kind: 'success'; already: boolean }
  | { kind: 'fail'; message: string };

/**
 * 결제 복귀 검증 — 마운트 시 paymentId로 verifyPurchaseAction 1회 호출(가드로 중복 방지).
 * 성공/실패/취소를 표시하고 상점으로 돌아가는 링크 제공. 지급 자체는 서버 권위(웹훅 포함).
 */
export function PayComplete({
  paymentId,
  errorCode,
  errorMessage,
}: {
  paymentId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}) {
  const [state, setState] = useState<State>(() =>
    errorCode
      ? { kind: 'fail', message: errorMessage || '결제가 취소되었거나 실패했습니다.' }
      : paymentId
        ? { kind: 'verifying' }
        : { kind: 'fail', message: '결제 정보를 찾을 수 없습니다.' },
  );
  const ran = useRef(false);

  useEffect(() => {
    if (errorCode || !paymentId || ran.current) return;
    ran.current = true;
    (async () => {
      const r = await verifyPurchaseAction(paymentId);
      if (r.status === 'success') setState({ kind: 'success', already: r.already });
      else
        setState({
          kind: 'fail',
          message:
            r.code === 'NOT_PAID'
              ? '결제가 완료되지 않았습니다.'
              : r.code === 'AMOUNT_MISMATCH'
                ? '결제 금액이 일치하지 않습니다. 고객센터로 문의해 주세요.'
                : '결제 확인에 실패했습니다. 잠시 후 다시 확인해 주세요.',
        });
    })();
  }, [paymentId, errorCode]);

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      {state.kind === 'verifying' ? (
        <>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-300 border-t-amber-500" />
          <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
            결제를 확인하고 있어요…
          </p>
        </>
      ) : state.kind === 'success' ? (
        <>
          <div className="text-4xl">✅</div>
          <p className="text-base font-bold">
            {state.already ? '이미 지급된 결제예요' : '결제가 완료됐어요'}
          </p>
          <p className="text-xs text-zinc-500">보상이 계정에 지급되었습니다.</p>
        </>
      ) : (
        <>
          <div className="text-4xl">⚠️</div>
          <p className="text-base font-bold">결제를 완료하지 못했어요</p>
          <p className="text-xs text-zinc-500">{state.message}</p>
        </>
      )}
      <Link
        href="/shop"
        className="mt-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white"
      >
        상점으로 돌아가기
      </Link>
    </div>
  );
}
