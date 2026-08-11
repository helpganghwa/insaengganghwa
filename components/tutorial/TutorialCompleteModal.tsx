'use client';

import { useEffect } from 'react';
import Link from 'next/link';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout } from '@/components/ModalLayout';
import { COMPLETE_BONUS } from '@/lib/game/challenges/defs';

// 완주 보너스 수치는 defs.ts에서만 읽는다 — 여기 적어 두었던 값(💎5,000+📦150)이 실지급
// (💎1,000+📦75)과 어긋난 채 신규 유저의 첫 화면에 걸려 있었다(2026-08-11). defs.ts는
// server-only가 아니라 클라에서 바로 읽힌다(도전 과제 목록 화면도 같은 방식으로 파생).
const BONUS_BOXES =
  COMPLETE_BONUS.boxes.weapon + COMPLETE_BONUS.boxes.armor + COMPLETE_BONUS.boxes.accessory;

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
    <ModalShell onClose={onClose} onSubmit={onClose} label="튜토리얼 완료">
      <ModalLayout
        icon="🎉"
        title="튜토리얼 완료!"
        subtitle={
          <span className="font-bold text-amber-600 dark:text-amber-400">첫 강화 시작됨</span>
        }
        footer={
          <button
            type="button"
            onClick={onClose}
            style={{ flex: 1 }}
            className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-[14px] font-extrabold text-amber-950"
          >
            인생강화 계속하기 ⚒️
          </button>
        }
      >
        <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          강화는{' '}
          <b className="text-amber-600 dark:text-amber-400">시간이 지날수록 성공 확률이 올라가요</b> —
          기다렸다가 강화하는 것이 인생강화의 기본이에요.
        </p>

        <Link
          prefetch={false}
          href="/challenges"
          onClick={onClose}
          className="mt-3 block rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2.5 text-left dark:bg-amber-500/10"
        >
          <span className="text-[13px] font-bold text-amber-700 dark:text-amber-300">
            🏆 도전 과제가 열렸어요!
          </span>
          <span className="mt-0.5 block text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
            과제를 하나씩 달성할 때마다 다이아 보상 — 전부 완료하면{' '}
            <b className="text-amber-600 dark:text-amber-400">
              💎 {COMPLETE_BONUS.diamond.toLocaleString('ko-KR')} + 📦 {BONUS_BOXES}
            </b>{' '}
            보너스까지!
          </span>
        </Link>
      </ModalLayout>
    </ModalShell>
  );
}
