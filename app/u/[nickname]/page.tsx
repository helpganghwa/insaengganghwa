import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { getSessionUserId } from '@/lib/auth/session';
import { profiles } from '@/lib/db/schema/profiles';
import { userProfiles } from '@/lib/db/schema/avatar';
import { catalogItems, equipmentInstances, userCodex, type Slot } from '@/lib/db/schema/equipment';
import { pieceCombatPower, totalCombatPower } from '@/lib/game/balance';
import { championCatalogIds } from '@/lib/game/codex/ranking';
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder } from '@/components/RarityFrame';
import { CharacterStage } from '@/components/CharacterStage';

import { ReportButton } from './ReportButton';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
const SLOT_EMOJI: Record<Slot, string> = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };

/** 닉네임 → 공개 프로필 데이터(착용 세트 + 총 전투력). 미존재 시 null. */
async function loadProfile(nickname: string) {
  const [prof] = await db
    .select({
      id: profiles.id,
      nickname: profiles.nickname,
      activeProfileId: profiles.activeProfileId,
    })
    .from(profiles)
    .where(eq(profiles.nickname, nickname))
    .limit(1);
  if (!prof) return null;

  // 대표 프로필 캐릭터 이미지(있으면).
  let profileId: string | null = null;
  let charImg: string | null = null;
  if (prof.activeProfileId) {
    const [up] = await db
      .select({ id: userProfiles.id, rotations: userProfiles.rotations, activeDirection: userProfiles.activeDirection })
      .from(userProfiles)
      .where(eq(userProfiles.id, prof.activeProfileId))
      .limit(1);
    if (up) {
      profileId = up.id;
      const rot = up.rotations as Record<string, string>;
      charImg = rot[up.activeDirection] ?? null;
    }
  }

  const [equipped, codexAgg, champSet] = await Promise.all([
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
        and(eq(equipmentInstances.userId, prof.id), isNotNull(equipmentInstances.equippedSlot)),
      ),
    db
      .select({ s: sql<number>`coalesce(sum(${userCodex.maxEnhanceLevel}),0)::int` })
      .from(userCodex)
      .where(eq(userCodex.userId, prof.id)),
    championCatalogIds(prof.id),
  ]);

  const total = totalCombatPower(
    equipped.map((e) => pieceCombatPower(e.enhanceLevel, e.transcendLevel)),
    Number(codexAgg[0]?.s ?? 0),
  );
  const pieces = equipped.map((e) => ({ ...e, isChampion: champSet.has(e.catalogItemId) }));
  return {
    nickname: prof.nickname,
    ownerId: prof.id,
    profileId,
    charImg,
    equipped: pieces,
    total,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ nickname: string }>;
}): Promise<Metadata> {
  const { nickname: raw } = await params;
  const nickname = decodeURIComponent(raw);
  const data = await loadProfile(nickname);
  if (!data) return { title: '인생강화' };
  const title = `${data.nickname} — 인생강화`;
  const description = `총 전투력 ⚔️${data.total.toLocaleString('ko-KR')}.`;
  const ogImage = `/og/${encodeURIComponent(nickname)}`;
  return {
    title,
    description,
    openGraph: { title, description, images: [ogImage] },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname: raw } = await params;
  const data = await loadProfile(decodeURIComponent(raw));
  if (!data) notFound();

  const bySlot = new Map(data.equipped.map((e) => [e.slot, e]));
  const viewerId = await getSessionUserId();
  // 신고 버튼: 대표 프로필 존재 + 로그인 + 본인 아님.
  const canReport = !!data.profileId && !!viewerId && viewerId !== data.ownerId;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[390px] bg-white px-4 py-6 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <header className="text-center">
        {data.charImg ? (
          <CharacterStage charSrc={data.charImg} className="mx-auto aspect-square w-44" />
        ) : (
          <div className="text-4xl">🏆</div>
        )}
        <h1 className="mt-2 text-xl font-bold">{data.nickname}</h1>
        <p className="text-xs text-zinc-500">인생강화 플레이어</p>
        {canReport && <ReportButton profileId={data.profileId!} />}
      </header>

      <section className="mt-5 rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="mb-2 text-xs font-medium text-zinc-500">장착 세트</div>
        <div className="grid grid-cols-3 gap-2">
          {(['weapon', 'armor', 'accessory'] as Slot[]).map((s) => {
            const it = bySlot.get(s);
            if (!it) {
              return (
                <div
                  key={s}
                  className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-zinc-300 px-1 text-center text-zinc-400 dark:border-zinc-700"
                >
                  <span className="text-2xl" aria-hidden>{SLOT_EMOJI[s]}</span>
                  <span className="text-[10px]">{SLOT_LABEL[s]}</span>
                  <span className="text-[9px]">미장착</span>
                </div>
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
                  isChampion={it.isChampion}
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
        <div className="mt-3 border-t border-zinc-100 pt-2 text-right text-sm font-bold dark:border-zinc-900">
          ⚔️ 총 전투력 {data.total.toLocaleString('ko-KR')}
        </div>
      </section>

      <Link
        href="/login"
        className="mt-5 block rounded-full bg-amber-500 py-3 text-center text-sm font-bold text-amber-950"
      >
        나도 인생강화 시작하기 →
      </Link>
    </main>
  );
}
