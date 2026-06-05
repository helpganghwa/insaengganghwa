'use client';

/**
 * 신규 첫 진입 — 메인페이지에서 튜토리얼 시작/건너뛰기 선택 팝업.
 * 선택에 따라 코치 진행 여부 결정(시작=ACTIVE, 건너뛰기=DONE).
 */
export function TutorialIntroModal({
  pending,
  onStart,
  onSkip,
}: {
  pending: boolean;
  onStart: () => void;
  onSkip: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="튜토리얼 안내"
      className="pointer-events-auto fixed inset-0 z-[62] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
    >
      <div className="w-full max-w-[340px] rounded-2xl bg-white p-5 text-center shadow-[0_0_40px_rgba(245,158,11,0.22)] ring-1 ring-amber-700/40 dark:bg-zinc-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png"
          alt=""
          aria-hidden
          className="mx-auto h-16 w-16 rounded-2xl"
          style={{ imageRendering: 'pixelated' }}
        />
        <h2 className="mt-3 text-lg font-extrabold">인생강화에 오신 걸 환영해요!</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          처음이시군요. 보급 상자 열기 → 장착 → 강화까지 1분이면 끝나는 짧은 안내를
          시작할까요?
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onStart}
            disabled={pending}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-3 text-[14px] font-extrabold text-amber-950 disabled:opacity-60"
          >
            ⚒️ 튜토리얼 시작하기
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={pending}
            className="w-full rounded-xl px-3 py-2 text-[12px] font-medium text-zinc-500 disabled:opacity-60 dark:text-zinc-400"
          >
            건너뛰기
          </button>
        </div>
      </div>
    </div>
  );
}
