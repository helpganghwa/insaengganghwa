import Link from 'next/link';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';
import { userEquipment, type Slot } from '@/lib/db/schema/equipment';
import { userProfiles } from '@/lib/db/schema/avatar';
import { CharacterStage } from '@/components/CharacterStage';
import { combatPowerFromOwned } from '@/lib/game/equipment/combat-power';
import { liberatedItemRanks } from '@/lib/game/codex/ranking';
import { getCatalogMap, completeCatalog } from '@/lib/game/catalog';

import { BoastLauncher } from '@/components/BoastModal';
import { TranscendSprite } from '@/components/TranscendSprite';
import { rarityBorderStyle, hasRarityBorder, TranscendTag } from '@/components/RarityFrame';

import { NicknameEditor } from './NicknameEditor';
import { ReferralSection } from './ReferralSection';
import { getReferralStats } from '@/lib/game/referral/stats';
import { getIncomingRequestCount } from '@/lib/game/friends';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
const SLOT_EMOJI: Record<Slot, string> = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };
const MENU = [
  { href: '/friends', icon: '👥', label: '친구' },
  { href: '/me/profiles', icon: '✨', label: '아바타 관리' },
  { href: '/checkin', icon: '⚡', label: '출석 캘린더' },
  { href: '/me/codex', icon: '📖', label: '도감' },
  { href: '/leaderboard', icon: '🏆', label: '랭킹' },
  { href: '/me/settings', icon: '⚙️', label: '설정' },
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
        publicCode: profiles.publicCode,
        diamond: profiles.diamond,
        nicknameChangedCount: profiles.nicknameChangedCount,
        activeProfileId: profiles.activeProfileId,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
    db
      // 착용 — 카탈로그 메타는 캐시(getCatalogMap)에서 in-memory 결합.
      .select({
        catalogItemId: userEquipment.catalogItemId,
        enhanceLevel: userEquipment.enhanceLevel,
        transcendLevel: userEquipment.transcendLevel,
      })
      .from(userEquipment)
      .where(
        and(eq(userEquipment.userId, userId), isNotNull(userEquipment.equippedSlot)),
      ),
    db
      // 총 전투력용 — 보유 전 인스턴스(착용 무관). 카탈로그 dedup·합산은 앱에서.
      .select({
        catalogItemId: userEquipment.catalogItemId,
        enhanceLevel: userEquipment.enhanceLevel,
        transcendLevel: userEquipment.transcendLevel,
      })
      .from(userEquipment)
      .where(eq(userEquipment.userId, userId)),
    liberatedItemRanks(userId),
    db
      .select({
        id: userProfiles.id,
        rotations: userProfiles.rotations,
        activeDirection: userProfiles.activeDirection,
      })
      .from(userProfiles)
      .where(and(eq(userProfiles.userId, userId), isNull(userProfiles.hiddenAt)))
      .orderBy(desc(userProfiles.createdAt)),
    getReferralStats(userId),
    getCatalogMap(),
    getIncomingRequestCount(userId),
    ]),
    3500,
    'me.page',
  ).catch(() => null);
  const prof = _r?.[0] ?? [];
  const equippedRaw = _r?.[1] ?? [];
  const ownedAll = _r?.[2] ?? [];
  const libRanks = _r?.[3] ?? new Map<number, number>();
  const myProfiles = _r?.[4] ?? [];
  const referralStats = _r?.[5] ?? { totalReferrals: 0, totalDiamondEarned: 0, totalBoxEarned: 0 };
  const catMap = _r?.[6] ?? new Map();
  const friendReqCount = _r?.[7] ?? 0;
  await completeCatalog(catMap, equippedRaw.map((e) => e.catalogItemId));

  const nickname = prof[0]?.nickname ?? '플레이어';
  const publicCode = prof[0]?.publicCode ?? '';
  const total = combatPowerFromOwned(ownedAll);
  // 캐시 메타로 착용 아이템에 slot/code/name 결합.
  const equipped = equippedRaw.flatMap((e) => {
    const cat = catMap.get(e.catalogItemId);
    return cat ? [{ ...e, slot: cat.slot, code: cat.code, name: cat.name }] : [];
  });
  const bySlot = new Map(equipped.map((e) => [e.slot, e]));

  const activeProfileId = prof[0]?.activeProfileId ?? null;
  const activeProfile = myProfiles.find((p) => p.id === activeProfileId) ?? null;
  const dirImg = (p: { rotations: unknown; activeDirection: string }) =>
    (p.rotations as Record<string, string>)[p.activeDirection];

  return (
    <div className="space-y-4 px-4 py-6">
      {/* 내 정보 카드 — 좌: 닉네임/캐릭터/전투력 · 우: 장비 3종 */}
      <section className="rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-3">
        <div className="flex items-stretch gap-2">
          {/* 좌(4) — 머리 위 닉네임 + 캐릭터 */}
          <div className="flex basis-2/5 flex-col items-center gap-1">
            <NicknameEditor
              current={nickname}
              changedCount={prof[0]?.nicknameChangedCount ?? 0}
              diamond={String(prof[0]?.diamond ?? 0n)}
              className="relative z-10 text-white text-xs font-normal"
            />
            {activeProfile ? (
              <Link
                href={`/u/${encodeURIComponent(publicCode)}`}
                aria-label="내 프로필 상세"
                className="block"
              >
                <CharacterStage
                  charSrc={dirImg(activeProfile)}
                  className="aspect-[3/4] h-36 overflow-visible"
                />
              </Link>
            ) : (
              <Link
                href="/me/create"
                className="flex aspect-[3/4] h-36 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-white/25 text-white/60"
              >
                <span className="text-2xl" aria-hidden>✨</span>
                <span className="text-[11px]">생성</span>
              </Link>
            )}
          </div>

          {/* 우(6) — 장비 3종, 좌 높이에 맞춰 stretch */}
          <div className="flex basis-3/5 flex-col gap-1.5">
            {(['weapon', 'armor', 'accessory'] as Slot[]).map((s) => {
              const it = bySlot.get(s);
              if (!it) {
                return (
                  <Link
                    key={s}
                    href={`/inventory?slot=${s}`}
                    className="flex flex-1 items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-2 text-white/45"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/5 text-lg" aria-hidden>
                      {SLOT_EMOJI[s]}
                    </span>
                    <span className="text-[12px]">{SLOT_LABEL[s]} 장착</span>
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
                      championRank={libRanks.get(it.catalogItemId) ?? null}
                      size={42}
                      frameless
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 break-keep text-[12px] leading-tight text-white/85">{it.name}</div>
                    <div className="text-[12px] font-bold tabular-nums text-white">
                      +{it.enhanceLevel}
                      <TranscendTag level={it.transcendLevel} className="ml-1" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <BoastLauncher
        nickname={nickname}
        publicCode={publicCode}
        total={total}
        profileImg={activeProfile ? dirImg(activeProfile) : null}
        pieces={equipped.map((e) => ({
          slot: e.slot,
          code: e.code,
          name: e.name,
          enhanceLevel: e.enhanceLevel,
          transcendLevel: e.transcendLevel,
          championRank: libRanks.get(e.catalogItemId) ?? null,
          catalogItemId: e.catalogItemId,
        }))}
      />

      <ReferralSection
        totalReferrals={referralStats.totalReferrals}
        totalDiamondEarned={referralStats.totalDiamondEarned}
        totalBoxEarned={referralStats.totalBoxEarned}
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
              {m.href === '/friends' && friendReqCount > 0 ? (
                <span
                  aria-label={`친구 요청 ${friendReqCount}건`}
                  className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums"
                >
                  {friendReqCount > 99 ? '99+' : friendReqCount}
                </span>
              ) : null}
            </span>
            <span className="text-zinc-400">›</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
