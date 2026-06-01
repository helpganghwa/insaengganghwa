import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { getSessionUserId } from '@/lib/auth/session';
import { profiles } from '@/lib/db/schema/profiles';
import { userProfiles } from '@/lib/db/schema/avatar';
import { catalogItems, equipmentInstances, type Slot } from '@/lib/db/schema/equipment';
import { pieceCombatPower, totalCombatPower } from '@/lib/game/balance';
import { championCatalogIds } from '@/lib/game/codex/ranking';
import { getMyRanks } from '@/lib/game/leaderboard/queries';
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder } from '@/components/RarityFrame';
import { CharacterStage } from '@/components/CharacterStage';

import { ReportButton } from './ReportButton';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
const SLOT_EMOJI: Record<Slot, string> = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };

/**
 * 닉네임 → 공개 프로필 데이터(착용 세트 + KPI + 챔피언). 미존재 시 null.
 * React cache로 generateMetadata + page render 사이 dedupe — 한 요청 내
 * DB 쿼리 1번만 실행(이전엔 무한 로딩 원인이었음, 2026-06-01).
 */
const loadProfile = cache(async (nickname: string) => {
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
      .select({
        id: userProfiles.id,
        rotations: userProfiles.rotations,
        activeDirection: userProfiles.activeDirection,
      })
      .from(userProfiles)
      .where(eq(userProfiles.id, prof.activeProfileId))
      .limit(1);
    if (up) {
      profileId = up.id;
      const rot = up.rotations as Record<string, string>;
      charImg = rot[up.activeDirection] ?? null;
    }
  }

  // Promise.all + withTimeout — 한 쿼리 hang이 전체 페이지를 멈추지 않도록 3.5s 가드.
  // 실패 시 빈 결과로 graceful degrade (히어로·신고는 여전히 렌더).
  const _r = await withTimeout(
    Promise.all([
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
        .select({ s: sql<number>`coalesce(sum(${equipmentInstances.enhanceLevel}),0)::int` })
        .from(equipmentInstances)
        .where(eq(equipmentInstances.userId, prof.id)),
      db
        .select({ m: sql<number>`coalesce(max(${equipmentInstances.enhanceLevel}),0)::int` })
        .from(equipmentInstances)
        .where(eq(equipmentInstances.userId, prof.id)),
      championCatalogIds(prof.id),
      getMyRanks(prof.id),
    ]),
    3500,
    'u.profile',
  ).catch(() => null);
  const equipped = _r?.[0] ?? [];
  const sumAgg = _r?.[1] ?? [];
  const maxAgg = _r?.[2] ?? [];
  const champSet = _r?.[3] ?? new Set<number>();
  const ranks = _r?.[4] ?? { max: null, sum: null, combat: null };

  const sumEnhance = Number(sumAgg[0]?.s ?? 0);
  const maxEnhance = Number(maxAgg[0]?.m ?? 0);
  const total = totalCombatPower(
    equipped.map((e) => pieceCombatPower(e.enhanceLevel, e.transcendLevel)),
    sumEnhance,
  );
  const pieces = equipped.map((e) => ({ ...e, isChampion: champSet.has(e.catalogItemId) }));

  // 챔피언 아이템(이 플레이어가 1위인 카탈로그) 메타 — sprite/name 표시용.
  const champIds = [...champSet];
  const champItems = champIds.length
    ? await withTimeout(
        db
          .select({
            id: catalogItems.id,
            slot: catalogItems.slot,
            code: catalogItems.code,
            name: catalogItems.name,
          })
          .from(catalogItems)
          .where(inArray(catalogItems.id, champIds)),
        1500,
        'u.profile.champ',
      ).catch(() => [] as { id: number; slot: Slot; code: string; name: string }[])
    : [];

  return {
    nickname: prof.nickname,
    ownerId: prof.id,
    profileId,
    charImg,
    equipped: pieces,
    total,
    sumEnhance,
    maxEnhance,
    ranks,
    champItems,
  };
});

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
  const description = `총 전투력 ${data.total.toLocaleString('ko-KR')}.`;
  const ogImage = `/og/${encodeURIComponent(nickname)}`;
  return {
    title,
    description,
    openGraph: { title, description, images: [ogImage] },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  };
}

function rankBadge(rank: number | null | undefined): string {
  if (rank == null) return '—';
  return `#${rank.toLocaleString('ko-KR')}`;
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
  const canReport = !!data.profileId && !!viewerId && viewerId !== data.ownerId;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[390px] bg-zinc-950 text-zinc-50">
      {/* ── 히어로: 캐릭터 풀블리드 + 그라데이션 + 닉네임 ── */}
      <section className="relative flex h-[220px] items-end justify-center overflow-hidden bg-gradient-to-b from-amber-900/30 via-zinc-900 to-zinc-950">
        {data.charImg ? (
          <div className="absolute inset-0 flex items-end justify-center">
            <CharacterStage charSrc={data.charImg} className="aspect-[2/3] h-full" />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-30">
            🏆
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,transparent_30%,rgba(0,0,0,0.55))]" />
        <div className="relative z-10 mb-2 text-center">
          <h1 className="text-xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.7)]">
            {data.nickname}
          </h1>
        </div>
      </section>

      <div className="space-y-3 px-3 pb-4">
        {/* ── KPI 3종 ── */}
        <section className="-mt-3 grid grid-cols-3 gap-1.5">
          <KpiCard
            label="전투력"
            value={data.total.toLocaleString('ko-KR')}
            rank={rankBadge(data.ranks.combat?.rank)}
          />
          <KpiCard
            label="최고 강화"
            value={`+${data.maxEnhance}`}
            rank={rankBadge(data.ranks.max?.rank)}
          />
          <KpiCard
            label="합산 강화"
            value={data.sumEnhance.toLocaleString('ko-KR')}
            rank={rankBadge(data.ranks.sum?.rank)}
          />
        </section>

        {/* ── 장착 세트 ── */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2">
          <div className="mb-1.5 text-[10px] font-semibold tracking-wide text-zinc-400">
            장착 세트
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['weapon', 'armor', 'accessory'] as Slot[]).map((s) => {
              const it = bySlot.get(s);
              if (!it) {
                return (
                  <div
                    key={s}
                    className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-zinc-700 px-1 text-center text-zinc-500"
                  >
                    <span className="text-xl" aria-hidden>
                      {SLOT_EMOJI[s]}
                    </span>
                    <span className="text-[9px]">{SLOT_LABEL[s]}</span>
                  </div>
                );
              }
              return (
                <div
                  key={s}
                  style={rarityBorderStyle(it.transcendLevel)}
                  className={`relative flex aspect-square flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border-2 bg-zinc-950 px-1 text-center ${
                    hasRarityBorder(it.transcendLevel) ? '' : 'border-zinc-800'
                  }`}
                >
                  <RarityFrame level={it.transcendLevel} />
                  <TranscendSprite
                    code={it.code}
                    slot={s}
                    level={it.transcendLevel}
                    isChampion={it.isChampion}
                    size={48}
                    frameless
                  />
                  <span className="line-clamp-2 break-keep px-0.5 text-[9px] leading-tight text-zinc-400">
                    {it.name}
                  </span>
                  <span className="text-[11px] font-semibold text-zinc-100">+{it.enhanceLevel}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 챔피언 아이템(있을 때만) ── */}
        {data.champItems.length > 0 ? (
          <section className="rounded-xl border border-amber-700/50 bg-gradient-to-b from-amber-950/40 to-zinc-950 p-2">
            <div className="mb-1.5 flex items-baseline justify-between">
              <div className="text-[10px] font-semibold tracking-wide text-amber-300">
                1위 아이템
              </div>
              <div className="font-mono text-[10px] text-amber-200/80">
                {data.champItems.length}종
              </div>
            </div>
            <ul className="flex gap-1.5 overflow-x-auto pb-0.5">
              {data.champItems.map((c) => (
                <li
                  key={c.id}
                  className="flex w-12 shrink-0 flex-col items-center gap-0.5 rounded border border-amber-700/60 bg-zinc-950 p-0.5 text-center"
                >
                  <TranscendSprite
                    code={c.code}
                    slot={c.slot}
                    level={0}
                    isChampion
                    size={36}
                    frameless
                  />
                  <span className="line-clamp-1 break-keep text-[8px] leading-tight text-zinc-400">
                    {c.name}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ── CTA + 신고 ── */}
        <Link
          href="/login"
          className="block rounded-full bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-center text-sm font-bold text-amber-950 shadow-lg shadow-amber-900/30 transition active:scale-[0.98]"
        >
          나도 인생강화 시작하기 →
        </Link>
        {canReport && (
          <div className="text-center">
            <ReportButton profileId={data.profileId!} />
          </div>
        )}
      </div>
    </main>
  );
}

function KpiCard({ label, value, rank }: { label: string; value: string; rank: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/85 px-1.5 py-1.5 text-center shadow-lg shadow-black/30 backdrop-blur">
      <div className="text-[8px] font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-zinc-50">{value}</div>
      <div className="mt-0.5 font-mono text-[9px] tabular-nums text-amber-300">{rank}</div>
    </div>
  );
}
