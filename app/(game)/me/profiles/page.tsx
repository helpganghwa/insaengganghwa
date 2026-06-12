import Link from 'next/link';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { userProfiles } from '@/lib/db/schema/avatar';

import { ProfileSelector } from './ProfileSelector';

export default async function ProfileSelectPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
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
      .where(
        and(
          eq(userProfiles.userId, userId),
          eq(userProfiles.serverId, serverId),
          isNull(userProfiles.hiddenAt),
        ),
      )
      .orderBy(desc(userProfiles.createdAt)),
    db
      .select({ activeProfileId: characters.activeProfileId })
      .from(characters)
      .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
      .limit(1),
    ]),
    3500,
    'me.profiles.page',
  ).catch(() => null);
  const list = _r?.[0] ?? [];
  const p = _r?.[1] ?? [];

  return (
    <div className="space-y-4 px-4 py-6">
      {list.length === 0 ? (
        <Link
          href="/me/create"
          className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 py-10 text-center text-zinc-400 dark:border-zinc-700"
        >
          <span className="text-2xl" aria-hidden>
            ✨
          </span>
          <span className="text-xs">첫 아바타 만들기</span>
        </Link>
      ) : (
        <>
          <ProfileSelector
            profiles={list.map((r) => ({
              id: r.id,
              rotations: r.rotations as Record<string, string>,
              activeDirection: r.activeDirection,
            }))}
            activeProfileId={p[0]?.activeProfileId ?? null}
          />
          <Link
            href="/me/create"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-[0.99]"
          >
            <span aria-hidden>✨</span> 아바타 생성
          </Link>
        </>
      )}
    </div>
  );
}
