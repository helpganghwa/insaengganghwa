import Link from 'next/link';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { catalogItems, equipmentInstances, userCodex, type Slot } from '@/lib/db/schema/equipment';
import { userProfiles } from '@/lib/db/schema/avatar';
import { pieceCombatPower, totalCombatPower } from '@/lib/game/balance';
import { championCatalogIds } from '@/lib/game/codex/ranking';

import { BoastLauncher } from '@/components/BoastModal';
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder } from '@/components/RarityFrame';

import { NicknameEditor } from './NicknameEditor';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
const SLOT_EMOJI: Record<Slot, string> = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };
const MENU = [
  { href: '/me/create', icon: '✨', label: '프로필 생성' },
  { href: '/checkin', icon: '⚡', label: '출석 캘린더' },
  { href: '/me/codex', icon: '📖', label: '도감' },
  { href: '/leaderboard', icon: '🏆', label: '랭킹' },
  { href: '/me/settings', icon: '⚙️', label: '설정' },
  { href: '/probability', icon: '📜', label: '확률 공시' },
];

export default async function ProfilePage() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const [prof, equipped, codexAgg, champSet, myProfiles] = await Promise.all([
    db
      .select({
        nickname: profiles.nickname,
        diamond: profiles.diamond,
        nicknameChangedCount: profiles.nicknameChangedCount,
        activeProfileId: profiles.activeProfileId,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
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
    db
      .select({
        id: userProfiles.id,
        rotations: userProfiles.rotations,
        activeDirection: userProfiles.activeDirection,
      })
      .from(userProfiles)
      .where(and(eq(userProfiles.userId, userId), isNull(userProfiles.hiddenAt)))
      .orderBy(desc(userProfiles.createdAt)),
  ]);

  const nickname = prof[0]?.nickname ?? '플레이어';
  const codexSum = Number(codexAgg[0]?.s ?? 0);
  const total = totalCombatPower(
    equipped.map((e) => pieceCombatPower(e.enhanceLevel, e.transcendLevel)),
    codexSum,
  );
  const bySlot = new Map(equipped.map((e) => [e.slot, e]));

  const activeProfileId = prof[0]?.activeProfileId ?? null;
  const activeProfile = myProfiles.find((p) => p.id === activeProfileId) ?? null;
  const dirImg = (p: { rotations: unknown; activeDirection: string }) =>
    (p.rotations as Record<string, string>)[p.activeDirection];

  return (
    <div className="space-y-4 px-4 py-6">
      <section className="space-y-3 rounded-2xl border border-zinc-200 p-4 text-center dark:border-zinc-800">
        <NicknameEditor
          current={nickname}
          changedCount={prof[0]?.nicknameChangedCount ?? 0}
          diamond={String(prof[0]?.diamond ?? 0n)}
        />
        {activeProfile ? (
          <Link
            href="/me/profiles"
            aria-label="프로필 선택"
            className="mx-auto block aspect-square w-48 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dirImg(activeProfile)}
              alt="대표 프로필"
              draggable={false}
              className="h-full w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          </Link>
        ) : (
          <Link
            href="/me/create"
            className="mx-auto flex aspect-square w-48 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-700"
          >
            <span className="text-3xl" aria-hidden>
              ✨
            </span>
            <span className="text-xs">프로필 만들기</span>
          </Link>
        )}
        <div className="border-t border-zinc-100 pt-3 text-left dark:border-zinc-900">
          <div className="mb-2 text-xs font-medium text-zinc-500">장착 세트 (자랑 단위)</div>
          <div className="grid grid-cols-3 gap-2">
          {(['weapon', 'armor', 'accessory'] as Slot[]).map((s) => {
            const it = bySlot.get(s);
            if (!it) {
              return (
                <Link
                  key={s}
                  href={`/inventory?slot=${s}`}
                  className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-zinc-300 px-1 text-center text-zinc-400 dark:border-zinc-700"
                >
                  <span className="text-2xl" aria-hidden>{SLOT_EMOJI[s]}</span>
                  <span className="text-[10px]">{SLOT_LABEL[s]}</span>
                  <span className="text-[9px] underline">장착</span>
                </Link>
              );
            }
            return (
              <div
                key={s}
                style={rarityBorderStyle(it.transcendLevel)}
                className={`relative flex aspect-square flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl border-2 bg-white px-1 text-center dark:bg-zinc-950 ${
                  hasRarityBorder(it.transcendLevel) ? '' : 'border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <RarityFrame level={it.transcendLevel} />
                <TranscendSprite
                  code={it.code}
                  slot={s}
                  level={it.transcendLevel}
                  isChampion={champSet.has(it.catalogItemId)}
                  size={56}
                  frameless
                />
                <span className="px-0.5 text-[10px] leading-tight text-zinc-600 dark:text-zinc-400">
                  {it.name}
                </span>
                <span className="text-xs font-semibold">+{it.enhanceLevel}</span>
              </div>
            );
          })}
        </div>
          <div className="mt-3 text-right text-sm font-bold">
            ⚔️ 총 전투력 {total.toLocaleString('ko-KR')}
          </div>
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
