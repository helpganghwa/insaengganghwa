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

export type AnnouncementView = {
  id: string;
  category: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAtIso: string | null;
};
