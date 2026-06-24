import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { clientErrors } from '@/lib/db/schema/ops';

import { ClientErrorsClient, type ErrRow } from './ClientErrorsClient';

/** 관리자 클라이언트 에러 — 미해결 우선(발생많은·최근순) + 최근 해결분. (admin) 레이아웃이 게이트. */
export const dynamic = 'force-dynamic';

export default async function AdminClientErrorsPage() {
  const [open, resolved] = await Promise.all([
    db
      .select()
      .from(clientErrors)
      .where(eq(clientErrors.resolved, false))
      .orderBy(desc(clientErrors.lastSeen))
      .limit(200),
    db
      .select()
      .from(clientErrors)
      .where(eq(clientErrors.resolved, true))
      .orderBy(desc(clientErrors.lastSeen))
      .limit(30),
  ]);

  const toRow = (e: typeof clientErrors.$inferSelect): ErrRow => ({
    id: e.id.toString(),
    kind: e.kind,
    message: e.message,
    url: e.url,
    ua: e.ua,
    stack: e.stack,
    count: e.count,
    resolved: e.resolved,
    firstSeen: e.firstSeen.toISOString(),
    lastSeen: e.lastSeen.toISOString(),
  });

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-5 px-4 py-6 text-zinc-100">
      <div>
        <h1 className="text-xl font-bold">🐞 클라이언트 에러</h1>
        <p className="mt-1 text-xs text-zinc-500">
          미해결 {open.length}그룹. 동일 에러는 발생 횟수로 묶임. 외부 의존 없는 v1 수집.
        </p>
      </div>
      <ClientErrorsClient open={open.map(toRow)} resolved={resolved.map(toRow)} />
    </div>
  );
}
