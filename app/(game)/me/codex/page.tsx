import Link from 'next/link';
import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { catalogItems, userCodex, type Slot } from '@/lib/db/schema/equipment';
import { championCatalogIds } from '@/lib/game/codex/ranking';
import { TranscendSprite } from '@/components/TranscendSprite';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
const SLOT_EMOJI: Record<Slot, string> = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };
const SLOTS: Slot[] = ['weapon', 'armor', 'accessory'];

/** 도감 — GDD §5 / WIREFRAMES §7. 수집 + 최고 강화 표기. **보상 수령 없음**(전투력 보너스로 반영). */
export default async function CodexPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 빈 결과로 degrade(2026-05-29).
  const _r = await withTimeout(
    Promise.all([
    db
      .select({
        id: catalogItems.id,
        code: catalogItems.code,
        name: catalogItems.name,
        slot: catalogItems.slot,
      })
      .from(catalogItems)
      .where(eq(catalogItems.active, true)),
    db
      .select({ catalogItemId: userCodex.catalogItemId, max: userCodex.maxEnhanceLevel })
      .from(userCodex)
      .where(eq(userCodex.userId, userId)),
    championCatalogIds(userId),
    ]),
    3500,
    'codex.page',
  ).catch(() => null);
  const catalog = _r?.[0] ?? [];
  const codex = _r?.[1] ?? [];
  const champSet = _r?.[2] ?? new Set<number>();

  const codexMap = new Map(codex.map((c) => [c.catalogItemId, c.max]));
  const acquired = codex.length;
  const sumEnhance = codex.reduce((s, c) => s + c.max, 0);

  return (
    <div className="space-y-4 px-4 py-4">
      <header className="flex items-baseline gap-2">
        <h1 className="text-lg font-semibold">📖 도감</h1>
        <span className="ml-auto text-xs text-zinc-500">
          획득 {acquired} / {catalog.length}
        </span>
      </header>

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
                const champ = champSet.has(c.id);
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
                      isChampion={champ}
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

      <p className="text-center text-xs text-zinc-400">
        합산 강화 합 <span className="font-mono font-semibold">{sumEnhance}</span> · 전투력
        보너스로 반영(별도 수령 없음)
      </p>
    </div>
  );
}
