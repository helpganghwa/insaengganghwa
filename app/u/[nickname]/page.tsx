import { Suspense, cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { and, eq, inArray, isNotNull, or } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { getSessionUserId } from '@/lib/auth/session';
import { profiles } from '@/lib/db/schema/profiles';
import { userProfiles } from '@/lib/db/schema/avatar';
import { catalogItems, equipmentInstances, type Slot } from '@/lib/db/schema/equipment';
import { combatPowerFromOwned } from '@/lib/game/equipment/combat-power';
import { championCatalogIds } from '@/lib/game/codex/ranking';
import { getMyRanks } from '@/lib/game/leaderboard/queries';
import { getEnhanceLive } from '@/lib/game/stats/queries';
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder } from '@/components/RarityFrame';
import { CharacterStage } from '@/components/CharacterStage';
import { BoastLauncher } from '@/components/BoastModal';

import { ReportButton } from './ReportButton';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

/**
 * 핸들(공개 코드 또는 닉네임) → 공개 프로필 데이터(착용 세트 + KPI + 챔피언). 미존재 시 null.
 * publicCode(불변) 우선 + nickname(레거시 공유 링크 하위호환) 둘 다 허용.
 * React cache로 generateMetadata + page render 사이 dedupe — 한 요청 내
 * DB 쿼리 1번만 실행(이전엔 무한 로딩 원인이었음, 2026-06-01).
 */
const loadProfile = cache(async (handle: string) => {
  const [prof] = await db
    .select({
      id: profiles.id,
      nickname: profiles.nickname,
      publicCode: profiles.publicCode,
      activeProfileId: profiles.activeProfileId,
    })
    .from(profiles)
    .where(or(eq(profiles.publicCode, handle), eq(profiles.nickname, handle)))
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

  // 각 쿼리 **개별** withTimeout — 한 쿼리가 느려도 다른 결과를 살린다.
  // 이전: 5개를 한 묶음으로 3.5s 가드 → 가장 느린 쿼리(주로 ranks: unstable_cache 콜드
  // ~3s)에 도달하면 _r=null로 전부 비어버려 장비도 안 보였음(2026-06-01 수정).
  // ranks는 이 함수에서 빼고 페이지에서 <Suspense>로 stream(첫 페인트 지연 제거).
  const [equipped, ownedAll, champSet] = await Promise.all([
    withTimeout(
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
      2500,
      'u.equipped',
    ).catch(() => [] as Array<{
      slot: Slot;
      catalogItemId: number;
      code: string;
      name: string;
      enhanceLevel: number;
      transcendLevel: number;
    }>),
    withTimeout(
      db
        .select({
          catalogItemId: equipmentInstances.catalogItemId,
          enhanceLevel: equipmentInstances.enhanceLevel,
          transcendLevel: equipmentInstances.transcendLevel,
        })
        .from(equipmentInstances)
        .where(eq(equipmentInstances.userId, prof.id)),
      2000,
      'u.owned',
    ).catch(
      () => [] as { catalogItemId: number; enhanceLevel: number; transcendLevel: number }[],
    ),
    withTimeout(championCatalogIds(prof.id), 2000, 'u.champion').catch(
      () => new Set<number>(),
    ),
  ]);

  const sumEnhance = ownedAll.reduce((a, r) => a + r.enhanceLevel, 0);
  const maxEnhance = ownedAll.reduce((a, r) => Math.max(a, r.enhanceLevel), 0);
  const total = combatPowerFromOwned(ownedAll);
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
    publicCode: prof.publicCode,
    ownerId: prof.id,
    profileId,
    charImg,
    equipped: pieces,
    total,
    sumEnhance,
    maxEnhance,
    champItems,
  };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ nickname: string }>;
}): Promise<Metadata> {
  const { nickname: raw } = await params;
  const handle = decodeURIComponent(raw);
  const data = await loadProfile(handle);
  if (!data) return { title: '인생강화' };
  const title = `${data.nickname} — 인생강화`;
  const description = `총 전투력 ${data.total.toLocaleString('ko-KR')}.`;
  // OG는 불변 코드로 — 닉 변경/링크 캐시에도 안정.
  const ogImage = `/og/${encodeURIComponent(data.publicCode)}`;
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

/** stream으로 도착한 랭크 — fade-up 1회. KpiCard rank 슬롯에 직접 전달. */
function rankBadgeStreamed(rank: number | null | undefined) {
  return <span className="inline-block animate-rank-in">{rankBadge(rank)}</span>;
}

/**
 * 랭크 3종을 stream으로 채우는 KPI 행 — `getMyRanks` 콜드 캐시는 ~3s까지 걸리므로
 * 메인 데이터(장비/합산/전투력)와 분리해서 Suspense로 점진 표시.
 * 첫 페인트: KPI 값 + rank='—' / 스트림 완료 후: rank='#N' 채워짐.
 */
async function KpiRowWithRanks({
  userId,
  total,
  sumEnhance,
  maxEnhance,
}: {
  userId: string;
  total: number;
  sumEnhance: number;
  maxEnhance: number;
}) {
  const ranks = await getMyRanks(userId);
  return (
    <section className="-mt-3 grid grid-cols-3 gap-1.5">
      <KpiCard
        label="전투력"
        value={total.toLocaleString('ko-KR')}
        rank={rankBadgeStreamed(ranks.combat?.rank)}
      />
      <KpiCard
        label="최고 강화"
        value={maxEnhance.toLocaleString('ko-KR')}
        rank={rankBadgeStreamed(ranks.max?.rank)}
      />
      <KpiCard
        label="합산 강화"
        value={sumEnhance.toLocaleString('ko-KR')}
        rank={rankBadgeStreamed(ranks.sum?.rank)}
      />
    </section>
  );
}

function KpiRowFallback({
  total,
  sumEnhance,
  maxEnhance,
}: {
  total: number;
  sumEnhance: number;
  maxEnhance: number;
}) {
  return (
    <section className="-mt-3 grid grid-cols-3 gap-1.5">
      <KpiCard label="전투력" value={total.toLocaleString('ko-KR')} rank="—" />
      <KpiCard label="최고 강화" value={maxEnhance.toLocaleString('ko-KR')} rank="—" />
      <KpiCard label="합산 강화" value={sumEnhance.toLocaleString('ko-KR')} rank="—" />
    </section>
  );
}

/**
 * "지금 인생강화는" 카드 — grow 풍 가로 4타일.
 * 강화중(라이브, 90s) + 누적 성공/유지/하락(10분). 색 톤으로 의미 구분.
 * <Suspense> stream — 첫 페인트 차단 없음.
 */
function fmtCompact(n: number): string {
  // 1,238,902 → "124만" — 가로 4타일 폭 90px 안에 들어가야 가독.
  return new Intl.NumberFormat('ko-KR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

type StatTone = 'live' | 'success' | 'hold' | 'down';
const TONE: Record<StatTone, { num: string; label: string }> = {
  live: { num: 'text-amber-200', label: 'text-amber-300/80' },
  success: { num: 'text-emerald-200', label: 'text-emerald-300/80' },
  hold: { num: 'text-zinc-200', label: 'text-zinc-400' },
  down: { num: 'text-rose-200', label: 'text-rose-300/80' },
};

function StatTile({
  tone,
  value,
  label,
}: {
  tone: StatTone;
  value: string;
  label: string;
}) {
  const t = TONE[tone];
  return (
    <div className="flex flex-1 flex-col items-center gap-1 px-1">
      <span className={`text-[9px] font-medium tracking-wide ${t.label}`}>{label}</span>
      <span className={`font-mono text-[13px] font-bold tabular-nums ${t.num}`}>{value}</span>
    </div>
  );
}

function StatsShell({ children }: { children: React.ReactNode }) {
  // KPI 카드와 톤 통일(2026-06-01): 글로우·이중 그라데이션 제거,
  // 평면 zinc-900/85 + zinc-800 border + rounded-xl.
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/85 p-2.5">
      <div className="mb-2 text-[10px] font-semibold tracking-wide text-zinc-400">
        지금 인생강화에서
      </div>
      <div className="flex divide-x divide-zinc-800/80">{children}</div>
    </section>
  );
}

async function EnhanceStatsCard() {
  const s = await getEnhanceLive();
  return (
    <StatsShell>
      <StatTile tone="live" value={`${s.activeUsers.toLocaleString('ko-KR')}명`} label="인생강화중" />
      <StatTile tone="success" value={fmtCompact(s.success)} label="강화 성공" />
      <StatTile tone="hold" value={fmtCompact(s.hold)} label="강화 유지" />
      <StatTile tone="down" value={fmtCompact(s.down)} label="강화 하락" />
    </StatsShell>
  );
}

function EnhanceStatsFallback() {
  return (
    <StatsShell>
      <StatTile tone="live" value="—" label="인생강화중" />
      <StatTile tone="success" value="—" label="강화 성공" />
      <StatTile tone="hold" value="—" label="강화 유지" />
      <StatTile tone="down" value="—" label="강화 하락" />
    </StatsShell>
  );
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
  const mode: 'guest' | 'self' | 'other' = !viewerId
    ? 'guest'
    : viewerId === data.ownerId
      ? 'self'
      : 'other';
  const canReport = mode === 'other' && !!data.profileId;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[390px] bg-zinc-950 text-zinc-50">
      {/* ── 히어로: 닉네임(머리 위) + 캐릭터 풀블리드 + 그라데이션 ── */}
      <section className="relative h-[220px] overflow-hidden bg-gradient-to-b from-amber-900/30 via-zinc-900 to-zinc-950">
        {data.charImg ? (
          <div className="absolute inset-0 flex items-end justify-center pb-[6px]">
            <CharacterStage
              charSrc={data.charImg}
              className="aspect-[2/3] h-full overflow-visible"
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-30">
            🏆
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,transparent_30%,rgba(0,0,0,0.55))]" />
        {/* 닉네임 — 상단 가운데, 아바타 머리 위 */}
        <div className="absolute inset-x-0 top-3 z-10 text-center">
          <h1 className="text-xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.7)]">
            {data.nickname}
          </h1>
        </div>
      </section>

      <div className="space-y-3 px-3 pb-4">
        {/* ── KPI 3종 — 값은 즉시, 순위는 Suspense로 stream(콜드 캐시 ~3s) ── */}
        <Suspense
          fallback={
            <KpiRowFallback
              total={data.total}
              sumEnhance={data.sumEnhance}
              maxEnhance={data.maxEnhance}
            />
          }
        >
          <KpiRowWithRanks
            userId={data.ownerId}
            total={data.total}
            sumEnhance={data.sumEnhance}
            maxEnhance={data.maxEnhance}
          />
        </Suspense>

        {/* ── 장착 세트 ── */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2">
          <div className="mb-1.5 text-[10px] font-semibold tracking-wide text-zinc-400">
            장착 세트
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['weapon', 'armor', 'accessory'] as Slot[]).map((s) => {
              const it = bySlot.get(s);
              if (!it) {
                // 미장착 — 점선 박스를 톤다운(2026-06-01). 이모지 제거, border
                // zinc-700/2px → zinc-800/60·1px, 텍스트는 슬롯 이름만 작게.
                return (
                  <div
                    key={s}
                    className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-zinc-800/60 px-1 text-center"
                  >
                    <span className="text-[9px] text-zinc-600">{SLOT_LABEL[s]}</span>
                    <span className="text-[8px] text-zinc-700">비어 있음</span>
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

        {/* ── 누적 통계("지금 인생강화는") — CTA 직전 사회적 증거. ── */}
        <Suspense fallback={<EnhanceStatsFallback />}>
          <EnhanceStatsCard />
        </Suspense>

        {/* ── CTA 분기 — 모두 동일 폭·패딩, 디자인 강조만 다름. ── */}
        {mode === 'guest' ? (
          <Link
            href="/login"
            className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-bold text-amber-950 shadow-lg shadow-amber-900/30 transition active:scale-[0.98]"
          >
            인생강화 시작하기
          </Link>
        ) : null}

        {mode === 'self' ? (
          <BoastLauncher
            nickname={data.nickname}
            publicCode={data.publicCode}
            total={data.total}
            profileImg={data.charImg}
            pieces={data.equipped.map((e) => ({
              slot: e.slot,
              code: e.code,
              name: e.name,
              enhanceLevel: e.enhanceLevel,
              transcendLevel: e.transcendLevel,
              isChampion: e.isChampion,
              catalogItemId: e.catalogItemId,
            }))}
          />
        ) : null}

        {mode === 'other' ? (
          <>
            <BoastLauncher
              nickname={data.nickname}
              publicCode={data.publicCode}
              total={data.total}
              profileImg={data.charImg}
              pieces={data.equipped.map((e) => ({
                slot: e.slot,
                code: e.code,
                name: e.name,
                enhanceLevel: e.enhanceLevel,
                transcendLevel: e.transcendLevel,
                isChampion: e.isChampion,
                catalogItemId: e.catalogItemId,
              }))}
              label="프로필 공유하기"
            />
            {canReport ? <ReportButton profileId={data.profileId!} /> : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

function KpiCard({
  label,
  value,
  rank,
}: {
  label: string;
  value: string;
  rank: React.ReactNode;
}) {
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
