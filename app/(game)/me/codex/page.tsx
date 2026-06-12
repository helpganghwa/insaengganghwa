import Link from 'next/link';
import { getActiveServerId } from '@/lib/game/servers';
import { and, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { userEquipment, type Slot } from '@/lib/db/schema/equipment';
import { getActiveCatalog } from '@/lib/game/catalog';
import { liberatedItemRanks } from '@/lib/game/codex/ranking';
import { TranscendSprite } from '@/components/TranscendSprite';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
const SLOT_EMOJI: Record<Slot, string> = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };
const SLOTS: Slot[] = ['weapon', 'armor', 'accessory'];

/** 도감 — GDD §5 / WIREFRAMES §7. 수집 + 최고 강화 표기. **보상 수령 없음**(전투력 보너스로 반영). */
export default async function CodexPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) return null;

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 빈 결과로 degrade(2026-05-29).
  // 카탈로그는 캐시(getActiveCatalog) — 요청마다 DB 조회 제거. user_equipment·champion만 실시간.
  const _r = await withTimeout(
    Promise.all([
      getActiveCatalog(),
      db
        .select({ catalogItemId: userEquipment.catalogItemId, max: userEquipment.maxEnhanceLevel })
        .from(userEquipment)
        .where(and(eq(userEquipment.userId, userId), eq(userEquipment.serverId, serverId))),
      liberatedItemRanks(userId, serverId),
    ]),
    3500,
    'codex.page',
  ).catch(() => null);
  const catalog = _r?.[0] ?? [];
  const codex = _r?.[1] ?? [];
  const libRanks = _r?.[2] ?? new Map<number, number>();

  const codexMap = new Map(codex.map((c) => [c.catalogItemId, c.max]));

  return (
    <div className="space-y-4 px-4 py-4">
      {SLOTS.map((s) => {
        const items = catalog.filter((c) => c.slot === s);
        if (items.length === 0) return null;
        return (
          <section key={s}>
            <h2 className="mb-2 text-xs font-semibold text-zinc-500">
              {SLOT_EMOJI[s]} {SLOT_LABEL[s]}
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {items.map((c) => {
                const got = codexMap.has(c.id);
                if (!got) {
                  return (
                    <div
                      key={c.id}
                      className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 p-1 text-center opacity-40 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <span className="text-2xl" style={{ filter: 'grayscale(1)' }}>
                        {SLOT_EMOJI[s]}
                      </span>
                      <span className="px-0.5 text-[9px] leading-tight text-zinc-600 dark:text-zinc-400">
                        미획득
                      </span>
                    </div>
                  );
                }
                const rank = libRanks.get(c.id) ?? null;
                return (
                  <Link
                    key={c.id}
                    href={`/me/codex/${c.id}`}
                    className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-zinc-200 bg-white p-1 text-center dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <TranscendSprite
                      code={c.code}
                      slot={c.slot}
                      level={0}
                      championRank={rank}
                      size={40}
                      frameless
                    />
                    <span className="px-0.5 text-[9px] leading-tight text-zinc-600 dark:text-zinc-400">
                      {c.name}
                    </span>
                    <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      최고 +{codexMap.get(c.id)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
