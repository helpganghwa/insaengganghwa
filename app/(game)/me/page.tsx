import Link from 'next/link';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
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

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 빈 결과로 degrade(2026-05-29).
  const _r = await withTimeout(
    Promise.all([
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
    ]),
    3500,
    'me.page',
  ).catch(() => null);
  const prof = _r?.[0] ?? [];
  const equipped = _r?.[1] ?? [];
  const codexAgg = _r?.[2] ?? [];
  const champSet = _r?.[3] ?? new Set<number>();
  const myProfiles = _r?.[4] ?? [];

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
      {/* 내 정보 카드 — 헤더(닉네임·전투력) + 본문(캐릭터·장비 세로) */}
      <section className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-4">
        {/* 헤더 — 공유 / 닉네임(중앙) / 전투력 배지 */}
        <div className="mb-3 grid grid-cols-3 items-center gap-2">
          <div className="justify-self-start">
            <BoastLauncher
              compact
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
          </div>
          <div className="min-w-0 justify-self-center">
            <NicknameEditor
              current={nickname}
              changedCount={prof[0]?.nicknameChangedCount ?? 0}
              diamond={String(prof[0]?.diamond ?? 0n)}
              className="text-white"
            />
          </div>
          <span className="inline-flex h-7 shrink-0 items-center gap-1 justify-self-end rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 text-xs font-bold tabular-nums text-amber-300">
            <span>전투력</span>
            {total.toLocaleString('ko-KR')}
          </span>
        </div>

        {/* 본문 — 좌 캐릭터 + 우 장비 3종. 고정 높이(h-44)로 양쪽 높이를 맞춰 정렬·컴팩트. */}
        <div className="flex gap-3">
          {activeProfile ? (
            <Link href="/me/profiles" aria-label="프로필 선택" className="block shrink-0">
              <CharacterStage
                charSrc={dirImg(activeProfile)}
                className="aspect-[3/4] h-44"
              />
            </Link>
          ) : (
            <Link
              href="/me/create"
              className="flex aspect-[3/4] h-44 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-white/25 text-white/60"
            >
              <span className="text-2xl" aria-hidden>✨</span>
              <span className="text-[11px]">생성</span>
            </Link>
          )}

          <div className="flex h-44 flex-1 flex-col gap-2">
            {(['weapon', 'armor', 'accessory'] as Slot[]).map((s) => {
              const it = bySlot.get(s);
              if (!it) {
                return (
                  <Link
                    key={s}
                    href={`/inventory?slot=${s}`}
                    className="flex flex-1 items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-2 text-white/45"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5 text-base" aria-hidden>
                      {SLOT_EMOJI[s]}
                    </span>
                    <span className="text-[11px]">{SLOT_LABEL[s]} 장착</span>
                  </Link>
                );
              }
              return (
                <div
                  key={s}
                  style={rarityBorderStyle(it.transcendLevel)}
                  className={`flex flex-1 items-center gap-2 rounded-xl border bg-white/5 px-2 ${
                    hasRarityBorder(it.transcendLevel) ? '' : 'border-white/10'
                  }`}
                >
                  <div className="shrink-0">
                    <TranscendSprite
                      code={it.code}
                      slot={s}
                      level={it.transcendLevel}
                      isChampion={champSet.has(it.catalogItemId)}
                      size={34}
                      frameless
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-[11px] leading-tight text-white/85">{it.name}</div>
                    <div className="text-[11px] font-bold tabular-nums text-white">+{it.enhanceLevel}</div>
                  </div>
                </div>
              );
            })}
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
