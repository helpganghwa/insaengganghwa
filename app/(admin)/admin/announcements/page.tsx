import { listAllAnnouncements } from '@/lib/game/announcement';

import { AnnouncementsAdmin } from './AnnouncementsAdmin';

/** 관리자 공지사항 — 작성·발행·고정·삭제. (admin) 레이아웃이 게이트. */
export const dynamic = 'force-dynamic';

export default async function AdminAnnouncementsPage() {
  const items = await listAllAnnouncements(100);
  return (
    <div className="px-4 py-4">
      <h1 className="mb-3 text-base font-bold">공지사항</h1>
      <AnnouncementsAdmin items={items} />
    </div>
  );
}
