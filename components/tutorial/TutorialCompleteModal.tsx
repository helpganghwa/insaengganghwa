'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * 튜토리얼 마무리 팝업 — 첫 강화 완료 후 1회.
 *  - 도전 과제 소개(다음 목표 제시 — 튜토리얼 이후 이탈 방지)
 *  - 마무리 CTA(인생강화 도전)
 *  - 알림·앱 설치 안내는 제거(2026-07-18): 첫 진입 시점엔 앱 미설치가 대부분이라 너무 이르다 —
 *    강화페이지 프롬프트(아래 24시간 유예 후)·도전 과제 안내로 충분.
 */
export function TutorialCompleteModal({ onClose }: { onClose: () => void }) {
  // 튜토리얼 직후엔 알림 프롬프트를 띄우지 않는다 — 24시간 유예 후(다음 재방문) 강화페이지
  // 프롬프트가 2차 안내(D1 실측: 푸시 구독 43% vs 미구독 8% 재방문 — 재방문 루프 강화).
  // (push_dismiss_at(7일)은 명시적 거절 전용으로 별도 유지.)
  useEffect(() => {
    try {
      localStorage.setItem('push_dismiss_until', String(Date.now() + 24 * 60 * 60 * 1000));
    } catch {
      /* localStorage 차단 환경 — 무시 */
    }
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="튜토리얼 완료"
      className="fixed inset-0 z-[62] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
    >
      <div className="w-full max-w-[358px] rounded-2xl bg-white p-5 shadow-[0_0_40px_rgba(245,158,11,0.22)] ring-1 ring-amber-700/40 dark:bg-zinc-900">
        <div className="text-3xl">🎉</div>
        <h2 className="mt-1 text-lg font-extrabold">튜토리얼 완료!</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          첫 강화를 시작했어요. 강화는{' '}
          <b className="text-amber-600 dark:text-amber-400">시간이 지날수록 성공 확률이 올라가요</b> —
          기다렸다가 강화하는 것이 인생강화의 기본이에요.
        </p>

        <Link prefetch={false}
          href="/challenges"
          onClick={onClose}
          className="mt-4 block rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2.5 text-left dark:bg-amber-500/10"
        >
          <span className="text-[13px] font-bold text-amber-700 dark:text-amber-300">
            🏆 도전 과제가 열렸어요!
          </span>
          <span className="mt-0.5 block text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
            과제를 하나씩 달성할 때마다 다이아 보상 — 전부 완료하면{' '}
            <b className="text-amber-600 dark:text-amber-400">💎 5,000 + 📦 150</b> 보너스까지!
          </span>
        </Link>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-3 text-[14px] font-extrabold text-amber-950"
        >
          인생강화 계속하기 ⚒️
        </button>
      </div>
    </div>
  );
}
