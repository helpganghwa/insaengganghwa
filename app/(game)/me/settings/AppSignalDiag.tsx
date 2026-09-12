'use client';

import { useEffect, useState } from 'react';

import { isAppSession, isStandaloneDisplay, isTwaClient } from '@/lib/platform-client';
import { digitalGoodsAvailable, shouldUsePlayBilling } from '@/app/(game)/shop/play-checkout';

/**
 * 앱 판정 신호 진단 — **어드민에게만** 보인다.
 *
 * 웹앱(홈 화면 추가)과 플레이스토어 앱을 같은 기기에 둘 다 설치하면, 앱이 남긴 쿠키를 웹앱이
 * 같이 보기 때문에 웹앱 결제가 막힌다. 둘을 깨끗이 가르려면 "앱이 연 화면인가"를 쿠키가 아니라
 * `document.referrer`로 판정해야 하는데, 그 신호가 실기기에서 실제로 붙는지는 코드로 확인할 수
 * 없다(2026-09-12). 앱에서 이 화면을 열어 눈으로 확인하기 위한 임시 진단이다.
 *
 * 확인이 끝나면 지운다.
 */
type Sig = {
  referrer: string;
  appSession: boolean;
  standalone: boolean;
  twaCookie: boolean;
  dgPresent: boolean;
  dgOpens: boolean;
  playBilling: boolean;
};

export function AppSignalDiag() {
  const [s, setS] = useState<Sig | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const w = window as unknown as { getDigitalGoodsService?: unknown };
      const [dgOpens, playBilling] = await Promise.all([
        digitalGoodsAvailable().catch(() => false),
        shouldUsePlayBilling().catch(() => false),
      ]);
      if (!alive) return;
      setS({
        referrer: document.referrer || '(없음)',
        appSession: isAppSession(),
        standalone: isStandaloneDisplay(),
        twaCookie: isTwaClient(),
        dgPresent: typeof w.getDigitalGoodsService === 'function',
        dgOpens,
        playBilling,
      });
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!s) return null;
  const yn = (v: boolean) => (v ? 'O' : 'X');
  const appRef = s.referrer.startsWith('android-app://app.ganghwa.game');

  return (
    <section>
      <h2 className="mb-1.5 px-1 text-xs font-semibold text-zinc-500">앱 판정 신호 (운영자 전용)</h2>
      <div className="isolate overflow-hidden rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="mb-2 break-all font-mono text-[11px] leading-relaxed text-zinc-500">
          referrer: {s.referrer.slice(0, 80)}
        </p>
        <p className="font-mono text-[11px] leading-relaxed text-zinc-500">
          앱referrer {yn(appRef)} · 세션표식 {yn(s.appSession)} · standalone {yn(s.standalone)} · 쿠키{' '}
          {yn(s.twaCookie)}
        </p>
        <p className="font-mono text-[11px] leading-relaxed text-zinc-500">
          DigitalGoods 존재 {yn(s.dgPresent)} · 열림 {yn(s.dgOpens)}
        </p>
        <p className="mt-1.5 text-[12px] font-bold">
          지금 결제하면 → {s.playBilling ? 'Play 결제' : '포트원(웹) 결제'}
        </p>
      </div>
    </section>
  );
}
