/**
 * 길드 정보 값의 **실제 표시 마크업** — 길드 홈·길드 목록 팝업과 정보 편집 화면의 미리보기가
 * 같은 컴포넌트를 쓴다(2026-07-30).
 *
 * 미리보기를 따로 그리면 실제 화면이 바뀔 때마다 어긋난다. 표시 방법을 여기 한 곳에만 두고
 * 양쪽이 import 하면, 미리보기가 실제와 다를 수 없다.
 *
 * 서버·클라 양쪽에서 쓰므로 'use client'를 붙이지 않는다(순수 표현 컴포넌트).
 */

/** 길드 홈 공지 블록 — 값이 없으면 아무것도 그리지 않는다(홈과 동일). */
export function GuildNoticeBlock({ notice }: { notice: string | null }) {
  if (!notice) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
      <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
        공지
      </span>
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-200">
        {notice}
      </p>
    </div>
  );
}

/** 길드 홈 오픈채팅 입장 버튼 — 카카오 브랜드 색·심볼 그대로. */
export function GuildOpenchatButton({
  url,
  asLink = true,
}: {
  url: string | null;
  /** 미리보기에서는 실제로 이동하지 않게 span으로 그린다. */
  asLink?: boolean;
}) {
  if (!url) return null;
  const cls =
    'flex w-[82px] shrink-0 items-center justify-center gap-1 rounded-md bg-[#FEE500] px-1.5 py-1.5 text-[10px] font-bold text-black/85 active:opacity-70';
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/kakao/kakao_symbol.png" alt="" aria-hidden className="h-3 w-auto" />
      오픈채팅
    </>
  );
  if (!asLink) return <span className={cls}>{inner}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  );
}

/** 길드 목록·랭킹 팝업의 소개 블록 — 비어 있으면 안내 문장으로 대체(목록과 동일). */
export function GuildIntroBlock({ intro }: { intro: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-zinc-400">길드 소개</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        {intro?.trim() ? intro : '등록된 소개가 없습니다.'}
      </p>
    </div>
  );
}
