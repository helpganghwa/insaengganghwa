import { redirect } from 'next/navigation';
import { and, eq, lte, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { AppHeader } from '@/components/AppHeader';
import { BottomNav } from '@/components/BottomNav';
import { SpritePreloader } from '@/components/SpritePreloader';

/**
 * 인증 필요 라우트 그룹 — WIREFRAMES §0 셸.
 * 비로그인 → /login (로컬 JWT 검증, CLAUDE §11.1). 고정 390 중앙 컬럼.
 */
export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');
  // 프로필/스타터 지급은 DB 트리거(auth.users INSERT → handle_new_user) + 기존 유저
  // 백필 마이그레이션이 담당 — 앱 렌더 핫패스에 부트스트랩 없음(hang 위험 제거).

  // BottomNav 알림 dot — 완료 시점 도달한 강화 작업 존재 여부(서버 시계).
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(enhancementJobs)
    .where(
      and(
        eq(enhancementJobs.userId, userId),
        eq(enhancementJobs.status, 'running'),
        lte(enhancementJobs.completeAt, sql`now()`),
      ),
    );
  const hasCompletedEnhance = (row?.n ?? 0) > 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-1 flex-col shadow-sm">
      <SpritePreloader />
      <AppHeader userId={userId} />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <BottomNav hasCompletedEnhance={hasCompletedEnhance} />
    </div>
  );
}
