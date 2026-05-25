import { notFound } from 'next/navigation';
import { eq, desc } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { worldHistory } from '@/lib/db/schema/world';

import { NoticeForm } from './NoticeForm';

/**
 * 운영자 공지 publish — 세계역사에 operator_notice 즉시 적재.
 * 1인 운영 도구. is_admin=true 계정만 진입.
 */
export default async function WorldNoticePage() {
  const userId = await getSessionUserId();
  if (!userId) notFound();
  const [p] = await db
    .select({ isAdmin: profiles.isAdmin })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!p?.isAdmin) notFound();

  // 최근 운영자 공지 10건 확인용.
  const recent = await db
    .select({
      id: worldHistory.id,
      message: worldHistory.message,
      eventType: worldHistory.eventType,
      createdAt: worldHistory.createdAt,
    })
    .from(worldHistory)
    .orderBy(desc(worldHistory.createdAt))
    .limit(10);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[720px] bg-white px-4 py-6 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <header className="mb-5">
        <h1 className="text-xl font-bold">📜 세계역사 — 운영자 공지</h1>
        <p className="mt-1 text-[12px] text-zinc-500">
          입력한 메시지를 세계역사에 즉시 적재합니다(operator_notice). 마크다운 강조{' '}
          <code>**굵게**</code>, <code>_기울임_</code> 지원.
        </p>
      </header>

      <NoticeForm />

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">최근 기록 10건</h2>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {recent.map((r) => (
            <li key={String(r.id)} className="px-3 py-2 text-[12px]">
              <span className="mr-1.5 inline-block rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-mono dark:bg-zinc-800">
                {r.eventType}
              </span>
              <span className="text-zinc-700 dark:text-zinc-200">{r.message}</span>
              <span className="ml-2 text-[10px] text-zinc-400 tabular-nums">
                {r.createdAt.toLocaleString('ko-KR')}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
