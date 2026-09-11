'use client';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout } from '@/components/ModalLayout';

/**
 * 신규 첫 진입 — 메인페이지 튜토리얼 시작 팝업.
 * 건너뛰기 없음(2026-07-15) — 시작만 가능. 이탈 경로는 진행 중 '그만두기'로 일원화
 * (인트로서 스킵한 유저가 첫 루프를 전혀 모른 채 방치되는 문제 방지).
 *
 * ⚠ 백드롭·Esc로 닫히면 안 되는 유일한 팝업 — 닫을 수단이 '시작'뿐이라 onClose는 no-op이다.
 *   같은 이유로 뒤로가기 처리도 끈다(backToClose={false}) — 닫히지 않는 팝업에 히스토리 항목을
 *   쌓으면 뒤로가기 한 번이 아무 일 없이 삼켜지고, 신규 유저의 얕은 히스토리에서는 그다음 한 번에
 *   여전히 앱이 종료된다. 증상을 한 칸 미루는 것뿐이라 아예 쌓지 않는다.
 */
export function TutorialIntroModal({
  pending,
  onStart,
}: {
  pending: boolean;
  onStart: () => void;
}) {
  return (
    <ModalShell
      onClose={() => {}}
      onSubmit={pending ? undefined : onStart}
      label="튜토리얼 안내"
      backToClose={false}
    >
      <ModalLayout
        icon={
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/icons/icon-192.png"
            alt=""
            aria-hidden
            className="mx-auto h-14 w-14 rounded-2xl"
            style={{ imageRendering: 'pixelated' }}
          />
        }
        title="인생강화에 오신 걸 환영해요!"
        subtitle={<span className="font-bold text-amber-600 dark:text-amber-400">1분이면 끝나요</span>}
        footer={
          <button
            type="button"
            onClick={onStart}
            disabled={pending}
            style={{ flex: 1 }}
            className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-[14px] font-extrabold text-amber-950 disabled:opacity-60"
          >
            ⚒️ 튜토리얼 시작하기
          </button>
        }
      >
        <p className="text-center text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          처음이시군요. 보급 상자 열기 → 장착 → 강화까지 짧은 안내를 시작할까요?
        </p>
      </ModalLayout>
    </ModalShell>
  );
}
