'use client';

import { MarkdownView } from '@/components/MarkdownView';
import {
  ANNOUNCEMENT_CATEGORY_LABEL,
  ANNOUNCEMENT_CATEGORY_CLS,
} from '@/lib/game/announcement-shared';

/**
 * 공지 작성 실시간 미리보기 — 유저가 보는 게시판 상세/팝업(AnnouncementBoard의 Detail)을
 * 그대로 미러링. 카테고리 배지·색상·제목·마크다운 본문 모두 동일 컴포넌트/상수 재사용이라
 * 실제 노출과 1:1. 작성 폼 draft 상태를 그대로 받아 입력 즉시 반영.
 */
export function AnnouncementPreview({
  category,
  title,
  body,
  pinned,
}: {
  category: string;
  title: string;
  body: string;
  pinned: boolean;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">미리보기</h2>
        <span className="text-[11px] text-zinc-400">유저 게시판 화면</span>
      </div>

      {/* 모바일 프레임 — 유저 팝업(max-w 340) 모사 */}
      <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-900">
          <h3 className="text-sm font-bold">게시판</h3>
          <span className="ml-auto text-[13px] text-zinc-400">닫기</span>
        </div>
        {/* Detail 레이아웃 그대로 */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${ANNOUNCEMENT_CATEGORY_CLS[category] ?? ANNOUNCEMENT_CATEGORY_CLS.notice}`}
            >
              {ANNOUNCEMENT_CATEGORY_LABEL[category] ?? category}
            </span>
            {pinned && <span className="text-[11px] text-amber-500">📌</span>}
            <span className="ml-auto text-[10px] tabular-nums text-zinc-400">발행 시각</span>
          </div>
          <h2 className="mt-1.5 text-base font-bold leading-snug">
            {title || <span className="text-zinc-400">제목을 입력하세요</span>}
          </h2>
          <div className="mt-2 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-200">
            {body.trim() ? (
              <MarkdownView source={body} />
            ) : (
              <p className="text-zinc-400">내용을 입력하면 여기에 표시됩니다.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
