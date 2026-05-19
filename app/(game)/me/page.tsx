import Link from 'next/link';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { catalogItems, equipmentInstances, userCodex, type Slot } from '@/lib/db/schema/equipment';
import { pieceCombatPower, totalCombatPower } from '@/lib/game/balance';
import { championCatalogIds } from '@/lib/game/codex/ranking';
import { formatCompactKR } from '@/lib/ui/format-number';

import { BoastLauncher } from '@/components/BoastModal';
import { TranscendSprite } from '@/components/TranscendSprite';

import { NicknameEditor } from './NicknameEditor';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
const SLOT_EMOJI: Record<Slot, string> = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };
const MENU = [
  { href: '/me/codex', icon: '📖', label: '도감' },
  { href: '/leaderboard', icon: '🏆', label: '랭킹' },
  { href: '/me/settings', icon: '⚙️', label: '설정' },
  { href: '/probability', icon: '📜', label: '확률 공시' },
];

export default async function ProfilePage() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const [prof, equipped, codexAgg, champSet] = await Promise.all([
    db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.id, userId)).limit(1),
    db
      .select({
        slot: catalogItems.slot,
        catalogItemId: catalogItems.id,
        code: catalogItems.code,
        name: catalogItems.name,
        enhanceLevel: equipmentInstances.enhanceLevel,
        transcendLevel: equipmentInstances.transcendLevel,
      })
      .from(equipmentInstances)
      .innerJoin(catalogItems, eq(equipmentInstances.catalogItemId, catalogItems.id))
      .where(
        and(eq(equipmentInstances.userId, userId), isNotNull(equipmentInstances.equippedSlot)),
      ),
    db
      .select({ s: sql<number>`coalesce(sum(${userCodex.maxEnhanceLevel}),0)::int` })
      .from(userCodex)
      .where(eq(userCodex.userId, userId)),
    championCatalogIds(userId),
  ]);

  const nickname = prof[0]?.nickname ?? '플레이어';
  const codexSum = Number(codexAgg[0]?.s ?? 0);
  const total = totalCombatPower(
    equipped.map((e) => pieceCombatPower(e.enhanceLevel, e.transcendLevel)),
    codexSum,
  );
  const bySlot = new Map(equipped.map((e) => [e.slot, e]));

  return (
    <div className="space-y-4 px-4 py-6">
      <header className="text-center">
        <div className="text-4xl">🏆</div>
        <NicknameEditor current={nickname} />
      </header>

      <section className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="mb-2 text-xs font-medium text-zinc-500">장착 세트 (자랑 단위)</div>
        <div className="space-y-1.5">
          {(['weapon', 'armor', 'accessory'] as Slot[]).map((s) => {
            const it = bySlot.get(s);
            return (
              <div key={s} className="flex items-center gap-2 text-sm">
                {it ? (
                  <>
                    <TranscendSprite
                      code={it.code}
                      slot={s}
                      level={it.transcendLevel}
                      isChampion={champSet.has(it.catalogItemId)}
                      size={40}
                    />
                    <span className="flex-1">
                      {it.name}{' '}
                      <span className="text-zinc-400">+{it.enhanceLevel}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <span aria-hidden>{SLOT_EMOJI[s]}</span>
                    <span className="flex-1 text-zinc-400">
                      {SLOT_LABEL[s]} 미장착 —{' '}
                      <Link href={`/inventory?slot=${s}`} className="underline">
                        장착
                      </Link>
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 border-t border-zinc-100 pt-2 text-right text-sm font-bold dark:border-zinc-900">
          ⚔️ 총 전투력 {formatCompactKR(total)}
        </div>
      </section>

      <BoastLauncher
        nickname={nickname}
        total={total}
        pieces={equipped.map((e) => ({
          slot: e.slot,
          code: e.code,
          name: e.name,
          enhanceLevel: e.enhanceLevel,
          transcendLevel: e.transcendLevel,
          isChampion: champSet.has(e.catalogItemId),
        }))}
      />

      <nav className="space-y-2">
        {MENU.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <span className="flex items-center gap-3">
              <span aria-hidden className="text-xl">
                {m.icon}
              </span>
              <span className="text-sm font-medium">{m.label}</span>
            </span>
            <span className="text-zinc-400">›</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
