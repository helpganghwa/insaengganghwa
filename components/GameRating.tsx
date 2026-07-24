import { GAME_RATING, BUSINESS_INFO } from '@/lib/legal/content';

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

/** 내용정보 아이콘들 — 공식 도안(흰 배경·검은 픽토그램·라벨 밴드 포함, 외곽 투명). 전체이용가 심볼과
 *  동일 캔버스로 정규화돼 같은 높이면 시각 크기 일치. 별도 박스 불필요(도안 자체가 완결). */
export function RatingContentIcons({ className = 'h-6' }: { className?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {R.contentInfo.map((c) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={c.label} src={c.icon} alt={c.label} title={c.label} className={`${className} w-auto shrink-0`} />
      ))}
    </span>
  );
}

/** 컴팩트(푸터 등) — [전체이용가][폭력성] 전체이용가 / 다음 줄에 기관·분류번호. */
export function RatingLine({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        <RatingSymbol className="h-6" />
        <RatingContentIcons className="h-6" />
        <span className="font-semibold text-zinc-700 dark:text-zinc-200">{R.rating}</span>
      </div>
      <div className="mt-0.5">
        {R.authority} {R.classificationNo}
      </div>
    </div>
  );
}

/** 법적고지 카드 — 사업자정보와 동일 스타일(테두리 섹션 + 소제목 + dl 다항목). 심볼은 등급/내용정보 값에 인라인. */
export function RatingCard({ className = '' }: { className?: string }) {
  return (
    <section
      className={`rounded-lg border border-zinc-200 p-3 text-[11px] text-zinc-500 dark:border-zinc-800 ${className}`}
    >
      <h2 className="mb-1.5 font-semibold text-zinc-600 dark:text-zinc-400">게임물 등급분류 정보</h2>
      <dl className="space-y-1">
        <div className="flex gap-2">
          <dt className="w-24 shrink-0">게임물명</dt>
          <dd>{BUSINESS_INFO.company}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0">등급</dt>
          <dd className="flex items-center gap-1.5">
            <RatingSymbol className="h-6" />
            {R.rating}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0">내용정보</dt>
          <dd className="flex items-center gap-1.5">
            <RatingContentIcons className="h-6" />
            {R.contentInfo.map((c) => c.label).join(' · ')}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0">등급분류번호</dt>
          <dd>{R.classificationNo}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0">등급분류일자</dt>
          <dd>{R.classifiedAt}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0">등급분류기관</dt>
          <dd>{R.authority}</dd>
        </div>
      </dl>
    </section>
  );
}
