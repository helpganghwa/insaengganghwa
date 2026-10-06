'use client';

/**
 * 횟수·칸 옆 작은 ＋(2026-10-06) — 주변 글자색(currentColor)을 따라가 숫자와 한 덩어리로 보이게 한다.
 * 금색 채움 버튼은 숫자보다 튀어 보였다(사용자 지적). 보이는 크기는 작게, 누르는 영역은 before로 넓힌다.
 */
export function PlusChip({ label, onClick, className = '' }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-current/40 text-current opacity-75 transition hover:opacity-100 active:scale-90 before:absolute before:-inset-2.5 before:content-[''] ${className}`}
    >
      <svg viewBox="0 0 10 10" aria-hidden className="h-2 w-2">
        <path d="M5 1.5v7M1.5 5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}
