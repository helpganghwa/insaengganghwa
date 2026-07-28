import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { userProfiles } from '@/lib/db/schema/avatar';
import { runes } from '@/lib/db/schema/rune';

import { ProfileSelector } from './ProfileSelector';

export default async function ProfileSelectPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) return null;

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 빈 결과로 degrade(2026-05-29).
  // 속성(0141)은 아바타 종속 1:1 — left join으로 아바타별 이름/수치 동봉.
  const _r = await withTimeout(
    Promise.all([
      db
        .select({
          id: userProfiles.id,
          rotations: userProfiles.rotations,
          options: userProfiles.options,
          attrId: runes.id,
          attrName: runes.name,
          attrs: runes.attrs,
        })
        .from(userProfiles)
        .leftJoin(runes, eq(runes.sourceProfileId, userProfiles.id))
        .where(and(eq(userProfiles.userId, userId), eq(userProfiles.serverId, serverId)))
        .orderBy(desc(userProfiles.createdAt)),
      db
        .select({
          activeProfileId: characters.activeProfileId,
          equippedRuneId: characters.equippedRuneId,
          runeChangedAt: characters.runeChangedAt,
          diamond: characters.diamond,
        })
        .from(characters)
        .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
        .limit(1),
    ]),
    3500,
    'me.profiles.page',
  ).catch(() => null);
  const list = _r?.[0] ?? [];
  const ch = _r?.[1]?.[0];

  return (
    <div className="space-y-4 px-4 py-6">
      {list.length === 0 ? (
        <Link prefetch={false}
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
              isDefault: (r.options as { isDefault?: boolean } | null)?.isDefault === true,
              attrId: r.attrId?.toString() ?? null,
              attrName: r.attrName,
              attrs: r.attrs ?? [],
            }))}
            activeProfileId={ch?.activeProfileId ?? null}
            equippedRuneId={ch?.equippedRuneId?.toString() ?? null}
            runeChangedAtIso={ch?.runeChangedAt?.toISOString() ?? null}
            diamond={Number(ch?.diamond ?? 0n)}
          />
          <Link prefetch={false}
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
