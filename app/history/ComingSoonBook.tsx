import type { ReactNode } from 'react';
import Link from 'next/link';

import { assetUrl } from '@/lib/asset-versions';
import { PAPER, SERIF } from '@/app/wiki/theme';

/**
 * 역사 위키 준비 중 화면(2026-09-18) — 아직 쓰이지 않은 장을 펼친 책으로 보여 준다.
 * 왼쪽 면 = 제목·안내, 오른쪽 면 = 그 장에 들어갈 것(길드 깃발·인물 초상)을 옅게 깔고 '준비 중' 도장.
 * 배경은 대륙 지도를 아주 옅게 — 연대기 화면과 같은 세계라는 표시.
 */
export function ComingSoonBook({
  title,
  lead,
  gallery,
  caption,
}: {
  title: string;
  lead: string;
  gallery: ReactNode;
  caption?: string;
}) {
  return (
    <main className="relative flex min-h-[calc(100dvh-57px)] items-center justify-center overflow-hidden px-4 py-12 md:h-full md:min-h-0 md:overflow-y-auto">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl('/sprites/guild/worldmap.png')}
        alt=""
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 w-[860px] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-[.07] select-none"
        style={{
          imageRendering: 'pixelated',
          filter: 'grayscale(1) sepia(.6)',
          maskImage: 'radial-gradient(closest-side, #000 55%, transparent)',
          WebkitMaskImage: 'radial-gradient(closest-side, #000 55%, transparent)',
        }}
      />
      <section className="relative grid w-full max-w-[700px] overflow-hidden rounded-[6px] border border-[#d8ceb9] bg-[#fbf7ee] shadow-[0_22px_44px_-22px_rgba(42,37,30,.45),0_2px_0_#e9e0cc,0_4px_0_#e2d9c6] md:grid-cols-2">
        <div className="flex flex-col px-7 py-9 md:bg-[linear-gradient(to_left,rgba(42,37,30,.08),transparent_16%)] md:px-9">
          <div className={`text-[10.5px] tracking-[.24em] ${PAPER.muted}`}>역사 위키</div>
          <h1 className="mt-2 text-[34px] leading-none font-bold" style={SERIF}>
            {title}
          </h1>
          <i aria-hidden className="mt-5 block h-[2px] w-8 bg-[#8a4b23]" />
          <p className="mt-5 text-[15.5px] leading-[1.7] font-bold" style={SERIF}>
            준비 중입니다.
          </p>
          <p className={`mt-1.5 text-[12.5px] leading-[1.75] break-keep ${PAPER.muted}`}>{lead}</p>
          <div className="mt-8 md:mt-auto md:pt-10">
            <Link
              href="/history"
              className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#2a251e] px-4 py-2 text-[12.5px] font-bold text-[#f5f0e6] hover:bg-[#3a3329]"
            >
              연대기 보기
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
        <div className="relative border-t border-[#e2d9c6] px-6 py-9 md:border-t-0 md:border-l md:bg-[linear-gradient(to_right,rgba(42,37,30,.1),transparent_18%)] md:px-8">
          <div aria-hidden className="opacity-[.62]">
            {gallery}
          </div>
          {caption ? (
            <div className={`mt-5 text-center text-[10.5px] tracking-[.06em] ${PAPER.muted}`}>
              {caption}
            </div>
          ) : null}
          <div
            aria-hidden
            className="pointer-events-none absolute top-[46%] left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[9deg]"
          >
            <div className="relative grid h-[112px] w-[112px] place-items-center rounded-full border-[3px] border-[#a3402a]/85 bg-[#fbf7ee]/80 text-[#a3402a] shadow-[0_0_0_6px_rgba(251,247,238,.55)] motion-safe:animate-[igStamp_.55s_cubic-bezier(.3,1.4,.5,1)_.25s_both]">
              <i className="absolute inset-[5px] rounded-full border border-[#a3402a]/60" />
              <span className="text-[19px] font-bold tracking-[.1em]" style={SERIF}>
                준비 중
              </span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
