/**
 * 새 배포 감지 토스트 — PWA standalone 모드에서 종료/재실행 없이 갱신 적용.
 *
 * 동작:
 *  1. mount 시 /api/health 호출 → 현재 deployment id 기록(firstDpl)
 *  2. 1분 interval + 페이지 visibility 변경(앱 백그라운드 → 포그라운드) 시 폴링
 *  3. dpl 변경 감지 → 토스트 표시
 *  4. '지금 적용' 탭 → location.reload()
 *
 * 로컬 dev에선 dpl='dev' 고정이라 트리거 X.
 * Vercel preview/production만 작동.
 */
'use client';

import { useEffect, useState } from 'react';

const POLL_INTERVAL_MS = 60_000;

export function VersionUpdateToast() {
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    let firstDpl: string | null = null;
    let cancelled = false;

    async function check() {
      try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        if (!r.ok) return;
        const j = (await r.json()) as { dpl?: string };
        const cur = j.dpl;
        if (!cur || cur === 'dev') return; // 로컬 dev — 폴링 의미 없음
        if (firstDpl === null) {
          firstDpl = cur;
          return;
        }
        if (cur !== firstDpl && !cancelled) {
          setHasUpdate(true);
        }
      } catch {
        // 네트워크 실패 — 다음 사이클 재시도
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };

    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (!hasUpdate) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-amber-600/60 bg-zinc-900/95 px-4 py-2.5 text-sm text-zinc-100 shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur">
        <span aria-hidden>✨</span>
        <span className="font-semibold">새 버전이 준비됐어요</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-zinc-950 hover:brightness-110"
        >
          지금 적용
        </button>
      </div>
    </div>
  );
}
