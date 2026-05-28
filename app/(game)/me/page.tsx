import Link from 'next/link';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { catalogItems, equipmentInstances, userCodex, type Slot } from '@/lib/db/schema/equipment';
import { userProfiles } from '@/lib/db/schema/avatar';
import { CharacterStage } from '@/components/CharacterStage';
import { pieceCombatPower, totalCombatPower } from '@/lib/game/balance';
import { championCatalogIds } from '@/lib/game/codex/ranking';

import { BoastLauncher } from '@/components/BoastModal';
import { TranscendSprite } from '@/components/TranscendSprite';
import { rarityBorderStyle, hasRarityBorder } from '@/components/RarityFrame';

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
      {/* 내 정보 카드 — OG 배치 차용: 좌(닉네임+프로필), 우(장비 3종 세로) */}
      <section className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-800 to-zinc-950 p-3">
        <div className="flex gap-3">
          {/* 좌 — 닉네임 + 프로필 */}
          <div className="flex flex-1 flex-col gap-2">
            <div className="text-center">
              <NicknameEditor
                current={nickname}
                changedCount={prof[0]?.nicknameChangedCount ?? 0}
                diamond={String(prof[0]?.diamond ?? 0n)}
                className="text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]"
              />
            </div>
            {activeProfile ? (
              <Link href="/me/profiles" aria-label="프로필 선택" className="block">
                <CharacterStage charSrc={dirImg(activeProfile)} className="w-full border border-zinc-800" />
              </Link>
            ) : (
              <Link
                href="/me/create"
                className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-white/40 text-white/70"
              >
                <span className="text-3xl" aria-hidden>✨</span>
                <span className="text-xs">프로필 만들기</span>
              </Link>
            )}
          </div>

          {/* 우 — 장비 3종 세로 + 전투력 */}
          <div className="flex w-[36%] flex-col gap-1.5">
            {(['weapon', 'armor', 'accessory'] as Slot[]).map((s) => {
              const it = bySlot.get(s);
              if (!it) {
                return (
                  <Link
                    key={s}
                    href={`/inventory?slot=${s}`}
                    className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/25 p-1.5 text-white/55"
                  >
                    <span className="text-lg" aria-hidden>{SLOT_EMOJI[s]}</span>
                    <span className="text-[10px]">{SLOT_LABEL[s]} 장착</span>
                  </Link>
                );
              }
              return (
                <div
                  key={s}
                  style={rarityBorderStyle(it.transcendLevel)}
                  className={`flex items-center gap-1.5 overflow-hidden rounded-lg border bg-white p-1 dark:bg-zinc-950 ${
                    hasRarityBorder(it.transcendLevel) ? '' : 'border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  <TranscendSprite
                    code={it.code}
                    slot={s}
                    level={it.transcendLevel}
                    isChampion={champSet.has(it.catalogItemId)}
                    size={34}
                    frameless
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[10px] leading-tight text-zinc-600 dark:text-zinc-400">
                      {it.name}
                    </div>
                    <div className="text-[11px] font-semibold">+{it.enhanceLevel}</div>
                  </div>
                </div>
              );
            })}
            <div className="mt-auto pt-1 text-right text-[11px] font-bold text-white">
              ⚔️ {total.toLocaleString('ko-KR')}
            </div>
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
