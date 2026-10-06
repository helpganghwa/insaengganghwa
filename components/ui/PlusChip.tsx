'use client';

/**
 * 횟수·칸 옆 작은 ＋(2026-10-06) — 주변 글자색(currentColor)을 따라가 숫자와 한 덩어리로 보이게 한다.
 * 금색 채움 버튼은 숫자보다 튀어 보였다(사용자 지적). 보이는 크기는 작게, 누르는 영역은 before로 넓힌다.
 */
export function PlusChip({
  label,
  onClick,
  className = '',
  size = 'md',
}: {
  label: string;
  onClick: () => void;
  className?: string;
  /**
   * md 18px(본문 줄) · sm 14px(11px 글자 줄 안 — 줄 높이를 밀어내지 않게) ·
   * pill 21px 어두운 네모(그림 위 어두운 알약 옆 — 무한의 탑 머리, 알약과 같은 모양·배경).
   */
  size?: 'md' | 'sm' | 'pill';
}) {
  const box =
    size === 'pill'
      ? 'h-[21px] w-[21px] rounded-md border-transparent bg-black/55 text-zinc-100'
      : `${size === 'sm' ? 'h-[14px] w-[14px]' : 'h-[18px] w-[18px]'} rounded-full border-current/40 text-current opacity-75 hover:opacity-100`;
  const icon = size === 'sm' ? 'h-[7px] w-[7px]' : 'h-2 w-2';
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`relative inline-flex ${box} shrink-0 items-center justify-center border transition active:scale-90 before:absolute before:-inset-2.5 before:content-[''] ${className}`}
    >
      <svg viewBox="0 0 10 10" aria-hidden className={icon}>
        <path d="M5 1.5v7M1.5 5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}
