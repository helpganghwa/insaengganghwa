'use client';

import * as PortOne from '@portone/browser-sdk/v2';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { verifyIdentityAction } from './identity-actions';

/**
 * 본인인증 — 포트원 V2(KG이니시스 통합인증) requestIdentityVerification.
 * PC는 팝업으로 인라인 반환, 모바일은 redirectUrl로 리다이렉트 후 복귀(useEffect에서 처리).
 * 인증 완료 시 identityVerificationId를 서버 액션으로 넘겨 포트원 재조회·저장(성년 판정).
 */
export function IdentityVerifyRow({
  verified,
  storeId,
  channelKey,
}: {
  verified: boolean;
  storeId?: string;
  channelKey?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(verified);

  // 모바일 리다이렉트 복귀 — URL의 identityVerificationId를 검증한다.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get('identityVerificationId');
    if (!id) return;
    window.history.replaceState({}, '', window.location.pathname); // 중복 처리 방지
    if (sp.get('code')) {
      setErr(sp.get('message') || '본인인증에 실패했습니다.');
      return;
    }
    setBusy(true);
    verifyIdentityAction(id).then((r) => {
      setBusy(false);
      if (r.ok) {
        setDone(true);
        router.refresh();
      } else setErr(r.message);
    });
  }, [router]);

  const start = async () => {
    if (!storeId || !channelKey) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await PortOne.requestIdentityVerification({
        storeId,
        identityVerificationId: `idv-${crypto.randomUUID()}`,
        channelKey,
        redirectUrl: `${window.location.origin}/me/settings`,
      });
      // 모바일은 리다이렉트되어 여기 도달하지 않음(위 useEffect에서 처리). PC는 res 반환.
      if (!res) {
        setBusy(false);
        return;
      }
      if (res.code) {
        setBusy(false);
        setErr(res.message ?? '본인인증에 실패했습니다.');
        return;
      }
      const r = await verifyIdentityAction(res.identityVerificationId);
      setBusy(false);
      if (r.ok) {
        setDone(true);
        router.refresh();
      } else setErr(r.message);
    } catch (e) {
      setBusy(false);
      setErr((e as Error).message);
    }
  };

  if (done) return <span className="text-sm text-emerald-600">완료</span>;
  if (!storeId || !channelKey)
    return <span className="text-sm text-zinc-500">미인증 (준비 중)</span>;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-bold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {busy ? '진행 중…' : '본인인증'}
      </button>
      {err ? <span className="text-[11px] text-red-500">{err}</span> : null}
    </div>
  );
}
