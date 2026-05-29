import Link from 'next/link';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { userProfiles } from '@/lib/db/schema/avatar';
import { profiles } from '@/lib/db/schema/profiles';

import { ProfileSelector } from './ProfileSelector';

export default async function ProfileSelectPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 빈 결과로 degrade(2026-05-29).
  const _r = await withTimeout(
    Promise.all([
    db
      .select({
        id: userProfiles.id,
        rotations: userProfiles.rotations,
        activeDirection: userProfiles.activeDirection,
      })
      .from(userProfiles)
      .where(and(eq(userProfiles.userId, userId), isNull(userProfiles.hiddenAt)))
      .orderBy(desc(userProfiles.createdAt)),
    db
      .select({ activeProfileId: profiles.activeProfileId })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
    ]),
    3500,
    'me.profiles.page',
  ).catch(() => null);
  const list = _r?.[0] ?? [];
  const p = _r?.[1] ?? [];

  return (
    <div className="space-y-4 px-4 py-6">
      <header className="flex items-center gap-2">
        <Link href="/me" aria-label="뒤로" className="text-zinc-400">
          ‹
        </Link>
        <h1 className="text-lg font-bold">프로필 선택</h1>
      </header>

      {list.length === 0 ? (
        <Link
          href="/me/create"
          className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 py-10 text-center text-zinc-400 dark:border-zinc-700"
        >
          <span className="text-2xl" aria-hidden>
            ✨
          </span>
          <span className="text-xs">첫 프로필 만들기</span>
        </Link>
      ) : (
        <ProfileSelector
          profiles={list.map((r) => ({
            id: r.id,
            rotations: r.rotations as Record<string, string>,
            activeDirection: r.activeDirection,
          }))}
          activeProfileId={p[0]?.activeProfileId ?? null}
        />
      )}
    </div>
  );
}
