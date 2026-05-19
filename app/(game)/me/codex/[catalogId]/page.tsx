import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { catalogItems, type Slot } from '@/lib/db/schema/equipment';
import { getItemTop10, getMyItemRank } from '@/lib/game/codex/ranking';
import { loreByCode } from '@/lib/game/equipment/lore';
import { TranscendSprite } from '@/components/TranscendSprite';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

/**
 * 도감 아이템 상세 — WIREFRAMES §7.2 / BALANCE §3.3.
 * 그 카탈로그 아이템 강화 Top10(동률=먼저 달성 순) + 내 순위. 1위=챔피언(👑).
 */
export default async function CodexItemPage({
  params,
}: {
  params: Promise<{ catalogId: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const catalogId = Number((await params).catalogId);
  if (!Number.isInteger(catalogId) || catalogId <= 0) notFound();

  const [item] = await db
    .select({ id: catalogItems.id, code: catalogItems.code, name: catalogItems.name, slot: catalogItems.slot })
    .from(catalogItems)
    .where(eq(catalogItems.id, catalogId))
    .limit(1);
  if (!item) notFound();

  const [top, mine] = await Promise.all([
    getItemTop10(item.id),
    getMyItemRank(item.id, userId),
  ]);
  const iAmChampion = mine?.rank === 1;
  const lore = loreByCode(item.code);

  return (
    <div className="space-y-4 px-4 py-4">
      <header className="flex items-center gap-2">
        <Link href="/me/codex" className="text-sm text-zinc-500" aria-label="도감으로">
          ←
        </Link>
        <h1 className="text-lg font-semibold">{item.name}</h1>
        <span className="ml-auto text-xs text-zinc-500">{SLOT_LABEL[item.slot]}</span>
      </header>

      <div className="flex flex-col items-center gap-1 py-2">
        <TranscendSprite
          code={item.code}
          slot={item.slot}
          level={0}
          isChampion={iAmChampion}
          size={72}
        />
        <span className="text-xs text-zinc-500">
          내 최고 {mine ? `+${mine.maxLevel}` : '기록 없음'}
        </span>
      </div>

      {lore ? (
        <section className="rounded-xl border border-zinc-200 bg-white px-4 py-3.5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-zinc-400">
            📖 이야기
          </div>
          <p className="whitespace-pre-line text-[13px] leading-[1.75] text-zinc-700 dark:text-zinc-300">
            {lore}
          </p>
        </section>
      ) : null}

      <section className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950/50">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-amber-700 dark:text-amber-300">내 순위</span>
          <span className="font-mono text-lg font-bold text-amber-900 dark:text-amber-100">
            {mine ? `#${mine.rank.toLocaleString('ko-KR')}` : '—'}
          </span>
        </div>
        <div className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">
          {mine
            ? iAmChampion
              ? '👑 이 장비의 챔피언입니다'
              : `최고 +${mine.maxLevel}`
            : '이 장비를 강화하면 집계됩니다'}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        {top.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">
            아직 이 장비를 강화한 유저가 없습니다.
          </div>
        ) : (
          <ul>
            {top.map((e) => {
              const medal = e.rank === 1 ? '👑' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : null;
              return (
                <li key={e.userId}>
                  <Link
                    href={`/u/${encodeURIComponent(e.nickname)}`}
                    className={`flex items-center gap-3 border-b border-zinc-100 px-4 py-2.5 last:border-b-0 dark:border-zinc-900 ${
                      e.userId === userId ? 'bg-amber-50 dark:bg-amber-950/40' : ''
                    }`}
                  >
                    <span className="w-9 shrink-0 text-center font-mono text-sm tabular-nums">
                      {medal ?? `#${e.rank}`}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium">{e.nickname}</span>
                    <span className="font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
                      +{e.maxLevel}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="text-center text-xs text-zinc-400">
        상시 누적 · Top 10 · 동률은 먼저 달성한 순 (시즌 없음)
      </p>
    </div>
  );
}
