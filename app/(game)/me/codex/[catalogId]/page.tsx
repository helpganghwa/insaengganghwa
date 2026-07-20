import Link from 'next/link';
import { getActiveServerId } from '@/lib/game/servers';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { catalogItems, type Slot } from '@/lib/db/schema/equipment';
import { getItemTop10 } from '@/lib/game/codex/ranking';
import { loreByCode } from '@/lib/game/equipment/lore';
import { profileHref } from '@/lib/game/profile/href';
import { TranscendSprite } from '@/components/TranscendSprite';
import { GuildBadge } from '@/components/GuildBadge';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

/**
 * 도감 아이템 상세 — WIREFRAMES §7.2 / BALANCE §3.3.
 * 그 아이템의 이야기(로어 전문) + 강화 Top10(동률=먼저 달성 순). 개인 순위 표기 없음.
 */
export default async function CodexItemPage({
  params,
}: {
  params: Promise<{ catalogId: string }>;
}) {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) return null;

  const catalogId = Number((await params).catalogId);
  if (!Number.isInteger(catalogId) || catalogId <= 0) notFound();

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 빈 결과로 degrade(2026-05-29).
  const itemRows = await withTimeout(
    db
      .select({
        id: catalogItems.id,
        code: catalogItems.code,
        name: catalogItems.name,
        slot: catalogItems.slot,
      })
      .from(catalogItems)
      .where(eq(catalogItems.id, catalogId))
      .limit(1),
    3500,
    'codex.item',
  ).catch(() => [] as Array<{ id: number; code: string; name: string; slot: Slot }>);
  const [item] = itemRows;
  if (!item) notFound();

  const top = await withTimeout(getItemTop10(item.id, serverId), 3500, 'codex.top10').catch(
    () => [] as Awaited<ReturnType<typeof getItemTop10>>,
  );
  const lore = loreByCode(item.code);

  return (
    <div className="space-y-4 px-4 py-4">
      <header className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">{item.name}</h1>
        <span className="ml-auto text-xs text-zinc-500">{SLOT_LABEL[item.slot]}</span>
      </header>

      <div className="flex justify-center py-2">
        <TranscendSprite code={item.code} slot={item.slot} level={0} size={144} frameless />
      </div>

      {lore ? (
        <section className="rounded-xl border border-zinc-200 bg-white px-4 py-3.5 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="whitespace-pre-line text-[13px] leading-[1.75] text-zinc-700 dark:text-zinc-300">
            {lore}
          </p>
        </section>
      ) : null}

      <section className="isolate overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="border-b border-zinc-100 px-4 py-2 text-[11px] font-semibold tracking-wide text-zinc-400 dark:border-zinc-900">
          강화 순위 Top 10
        </div>
        {top.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">
            아직 이 장비를 강화한 유저가 없습니다.
          </div>
        ) : (
          <ul>
            {top.map((e) => {
              const medal = e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : null;
              return (
                <li key={e.userId}>
                  <Link prefetch={false}
                    href={profileHref(e.publicCode, serverId)}
                    className={`flex items-center gap-3 border-b border-zinc-100 px-4 py-2.5 last:border-b-0 dark:border-zinc-900 ${
                      e.userId === userId ? 'bg-amber-50 dark:bg-amber-950/40' : ''
                    }`}
                  >
                    <span className="w-9 shrink-0 text-center font-mono text-sm tabular-nums">
                      {medal ?? `#${e.rank}`}
                    </span>
                    {/* 아바타 — 닉네임 왼쪽(랭킹 페이지와 동일) */}
                    <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                      {e.profileImg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={e.profileImg}
                          alt=""
                          aria-hidden
                          className="h-full w-full object-contain"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      ) : null}
                    </span>
                    {/* 닉네임(위) + 길드명·문양(아래) */}
                    <span className="flex min-w-0 flex-1 flex-col justify-center">
                      <span className="truncate text-sm font-medium">{e.nickname}</span>
                      {e.guildName || e.guildEmblemUrl ? (
                        <GuildBadge
                          emblemUrl={e.guildEmblemUrl ?? null}
                          name={e.guildName ?? null}
                          size={11}
                          className="mt-0.5 max-w-full text-[10px] text-zinc-500 dark:text-zinc-400"
                        />
                      ) : null}
                    </span>
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
    </div>
  );
}
