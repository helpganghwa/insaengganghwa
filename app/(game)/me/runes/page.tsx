import { and, desc, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';
import { runes } from '@/lib/db/schema/rune';
import { characters } from '@/lib/db/schema/server';
import { withTimeout } from '@/lib/db/with-timeout';

import { RunesClient, type RuneRow } from './RunesClient';

/**
 * 룬 보관함 — 장착 히어로 + 정렬 리스트 + 상세 시트(상성·장착·쿨타임·💎단축).
 * 룬 = 아바타 생성 시 지급되는 속성 세트(3줄 불변). 확률 공시는 /probability §6.
 */
export default async function RunesPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const serverId = await getActiveServerId();

  // 콜드 커넥션 hang 시 무한 대기 방지 — 실패 시 빈 결과 degrade(§11.4).
  const _r = await withTimeout(
    Promise.all([
      db
        .select({ id: runes.id, name: runes.name, attrs: runes.attrs, createdAt: runes.createdAt })
        .from(runes)
        .where(and(eq(runes.userId, userId), eq(runes.serverId, serverId)))
        .orderBy(desc(runes.createdAt)),
      db
        .select({
          equipped: characters.equippedRuneId,
          changedAt: characters.runeChangedAt,
          diamond: characters.diamond,
        })
        .from(characters)
        .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
        .limit(1),
    ]),
    4000,
    'me.runes.page',
  ).catch(() => null);
  const rows = _r?.[0] ?? [];
  const ch = _r?.[1]?.[0];

  const list: RuneRow[] = rows.map((r) => ({
    id: r.id.toString(),
    name: r.name,
    attrs: r.attrs,
    createdAtIso: r.createdAt.toISOString(),
  }));

  return (
    <div className="px-4 py-6">
      <RunesClient
        runes={list}
        equippedId={ch?.equipped?.toString() ?? null}
        changedAtIso={ch?.changedAt?.toISOString() ?? null}
        diamond={Number(ch?.diamond ?? 0n)}
      />
    </div>
  );
}
