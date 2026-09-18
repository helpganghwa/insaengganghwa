import type { Metadata } from 'next';

import { ComingSoonBook } from '../ComingSoonBook';

/**
 * 역사 위키 · 인물(2026-09-18) — 준비 중. 오른쪽 면은 빈 초상 액자(역사 DB 읽기 역할은 캐릭터 표를 못 읽어 실제 인물은 아직 없음).
 * 내용이 없어 검색 색인은 막는다.
 */
export const metadata: Metadata = {
  title: '인물',
  robots: { index: false, follow: true },
};

function Portrait() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-[50%/44%] border border-[#b8ae9a] p-[3px]">
        <div className="relative h-[72px] w-[56px] overflow-hidden rounded-[50%/44%] border border-[#c9bfa9] bg-[#f1ead9]">
          <svg viewBox="0 0 56 72" className="absolute inset-0 h-full w-full" aria-hidden>
            <circle cx="28" cy="30" r="10.5" fill="#d8ceb9" />
            <path d="M7 72c1.5-15 10-23 21-23s19.5 8 21 23z" fill="#d8ceb9" />
          </svg>
        </div>
      </div>
      <i className="block h-[5px] w-10 rounded-full bg-[#e2d9c6]" />
    </div>
  );
}

export default function HistoryPeoplePage() {
  return (
    <ComingSoonBook
      title="인물"
      lead="점령전을 누빈 대장장이들의 이야기를 모으고 있습니다."
      gallery={
        <div className="grid grid-cols-3 gap-x-4 gap-y-5">
          {Array.from({ length: 6 }, (_, i) => (
            <Portrait key={i} />
          ))}
        </div>
      }
    />
  );
}
