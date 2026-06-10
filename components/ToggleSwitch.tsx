'use client';

/** 설정 페이지와 동일한 토글 스위치(독립 클릭형). 라벨은 호출처에서 별도 배치. */
export function ToggleSwitch({
  on,
  onToggle,
  label,
  disabled = false,
  className = '',
}: {
  on: boolean;
  onToggle: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        on ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
      } ${className}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
          on ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
