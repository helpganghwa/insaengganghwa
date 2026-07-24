import { GAME_RATING } from '@/lib/legal/content';

const R = GAME_RATING;

/**
 * 게임물 등급 표시 컴포넌트(게임산업법 §33). 공식 심볼(전체이용가)·내용정보 아이콘(폭력성)은
 * GRAC 배포 AI파일에서 추출한 원본. 내용정보 아이콘은 검은 도안이라 흰 박스에 담아 다크 테마 대응.
 */

/** 등급 심볼(공식) — 세로형이라 높이 기준. */
export function RatingSymbol({ className = 'h-10' }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={R.ratingSymbol} alt={R.rating} className={`${className} w-auto shrink-0`} />;
}

/** 내용정보 아이콘들 — 흰 박스(검은 도안 다크 테마 가시성). */
export function RatingContentIcons({ className = 'h-6' }: { className?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {R.contentInfo.map((c) => (
        <span key={c.label} className="inline-flex rounded-[3px] bg-white p-px" title={c.label}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.icon} alt={c.label} className={`${className} w-auto`} />
        </span>
      ))}
    </span>
  );
}

/** 컴팩트 한 줄(푸터 등) — 심볼 소형 + 등급·내용정보·번호 텍스트. */
export function RatingLine({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <RatingSymbol className="h-4" />
      <span>
        <b className="font-semibold text-emerald-600 dark:text-emerald-500">{R.rating}</b>
        {' · '}내용정보 {R.contentInfo.map((c) => c.label).join('·')}
        {' · '}
        {R.authority} {R.classificationNo}
      </span>
    </span>
  );
}

/** 상세 카드(법적고지·게임정보) — 법정 필수 정보 전부. */
export function RatingCard({ className = '' }: { className?: string }) {
  return (
    <section className={`rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 ${className}`}>
      <div className="flex items-center gap-3">
        <RatingSymbol className="h-12" />
        <div className="min-w-0">
          <div className="text-sm font-bold text-emerald-600 dark:text-emerald-500">{R.rating}</div>
          <div className="text-[11px] text-zinc-500">{R.authority}</div>
        </div>
      </div>
      <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] text-zinc-500">
        <dt>등급분류번호</dt>
        <dd className="text-zinc-700 dark:text-zinc-300">{R.classificationNo}</dd>
        <dt>등급분류일</dt>
        <dd className="text-zinc-700 dark:text-zinc-300">{R.classifiedAt}</dd>
      </dl>
      <div className="mt-2.5 flex items-center gap-2 border-t border-zinc-100 pt-2.5 text-[11px] text-zinc-500 dark:border-zinc-800/60">
        <span>내용정보</span>
        <RatingContentIcons className="h-7" />
        <span className="text-zinc-700 dark:text-zinc-300">{R.contentInfo.map((c) => c.label).join(' · ')}</span>
      </div>
    </section>
  );
}
