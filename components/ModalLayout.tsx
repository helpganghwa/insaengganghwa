'use client';

/**
 * 팝업 내부 레이아웃 — 헤더 · 컨텐츠 · 푸터 3단(사이는 투명 여백).
 *
 * `ModalShell`이 포털·백드롭·Esc·포커스·aria를 담당하고, 이 컴포넌트는 **패널 안쪽 모양만** 맡는다.
 * 호출처마다 흩어져 있던 폭(6종)·패딩(3종)·제목 크기·닫기 수단(4종)을 여기 한 곳으로 모은다.
 *
 * 제목을 카드 밖에 두는 이유: 무엇에 대한 팝업인지가 먼저 읽히고, 카드 안에는 정보만 남는다.
 * 푸터를 카드 밖에 두는 이유: 컨텐츠가 길어져 스크롤이 생겨도 버튼이 늘 같은 자리에 있다.
 */
export function ModalLayout({
  title,
  subtitle,
  icon,
  footer,
  children,
  /** 컨텐츠 카드 높이 상한 — 지정하면 그 안에서만 스크롤된다. 기본은 무제한(내부 스크롤 없음). */
  maxBodyClass,
  /** 컨텐츠 카드 패딩 — 목록형은 'sm'으로 줄여 행이 가장자리에 붙게 한다. */
  bodyPad = 'md',
  /** 카드 배경 없이 컨텐츠를 그대로 두고 싶을 때(이미지 헤더 등 자체 배경을 가진 경우). */
  bare = false,
}: {
  title: React.ReactNode;
  /** 제목 아래 한 줄 — 대상·수치·상태를 라벨로 덧붙인다. */
  subtitle?: React.ReactNode;
  /** 제목 위 큰 아이콘(경고 등). */
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  maxBodyClass?: string;
  bodyPad?: 'sm' | 'md';
  bare?: boolean;
}) {
  return (
    <div className="flex w-full max-w-[320px] flex-col gap-2.5">
      <div className="px-1 text-center">
        {icon ? <div className="text-[26px] leading-none">{icon}</div> : null}
        <h2 className={`text-[15px] font-extrabold ${icon ? 'mt-1' : ''}`}>{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-[11.5px] text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        ) : null}
      </div>

      <div
        className={
          bare
            ? `overflow-hidden rounded-2xl ${maxBodyClass ?? ''}`
            : `rounded-2xl bg-white ${bodyPad === 'sm' ? 'p-1.5' : 'p-4'} dark:bg-zinc-900 ${
                maxBodyClass ? `${maxBodyClass} overflow-y-auto` : ''
              }`
        }
      >
        {children}
      </div>

      {footer ? <div className="flex gap-2">{footer}</div> : null}
    </div>
  );
}

/** 팝업 푸터 버튼 — 톤만 고르면 크기·라운드가 통일된다. */
export function ModalButton({
  tone = 'ghost',
  grow = 1,
  onClick,
  disabled,
  children,
}: {
  tone?: 'primary' | 'danger' | 'info' | 'success' | 'neutral' | 'ghost' | 'contrast';
  /** flex 비율 — 주 동작을 넓히고 싶을 때 2. */
  grow?: number;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const TONE: Record<string, string> = {
    primary: 'bg-amber-600 text-white',
    danger: 'bg-red-600 text-white',
    info: 'bg-sky-600 text-white',
    success: 'bg-emerald-600 text-white',
    neutral: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
    contrast: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
    ghost:
      'border border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ flex: grow }}
      className={`rounded-xl py-2.5 text-[13px] font-bold transition active:opacity-90 disabled:opacity-50 ${TONE[tone]}`}
    >
      {children}
    </button>
  );
}
