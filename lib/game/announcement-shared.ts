// 공지사항 — 클라/서버 공용 상수·타입(서버 전용 db import 없음). 클라 컴포넌트는 여기서 import.
// (lib/game/announcement.ts는 server-only라 값(상수)을 클라에서 가져오면 postgres가 클라 번들로 끌려감)

export const ANNOUNCEMENT_CATEGORIES = [
  'notice',
  'maintenance',
  'update',
  'event',
  'policy',
  'probability',
] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

export const ANNOUNCEMENT_CATEGORY_LABEL: Record<string, string> = {
  notice: '공지',
  maintenance: '점검',
  update: '업데이트',
  event: '이벤트',
  policy: '정책',
  probability: '확률',
};

/** 카테고리 배지 색상 — 유저 게시판(AnnouncementBoard)·관리자 미리보기 공용(동일 색 보장). */
export const ANNOUNCEMENT_CATEGORY_CLS: Record<string, string> = {
  notice: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-300',
  maintenance: 'bg-red-500/15 text-red-600 dark:text-red-400',
  update: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  event: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  policy: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  probability: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
};

export type AnnouncementView = {
  id: string;
  category: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAtIso: string | null;
};
