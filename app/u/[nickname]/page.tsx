import { Suspense, cache } from 'react';
import { DEFAULT_SERVER_ID } from '@/lib/game/servers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { getAdminStatus } from '@/lib/auth/require-admin';
import { getActiveServerId } from '@/lib/game/servers';
import { getFriendRelation, type FriendRelation } from '@/lib/game/friends';
import { getUserGuildBrief } from '@/lib/game/guild';
import { getEnhancingUserCount } from '@/app/(game)/me/actions';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { catalogItems, userEquipment, type Slot } from '@/lib/db/schema/equipment';
import { combatPowerFromOwned } from '@/lib/game/equipment/combat-power';
import { liberatedItemRanks } from '@/lib/game/codex/ranking';
import { getMyRanks, getMyCountRanks } from '@/lib/game/leaderboard/queries';
import { getEnhanceLive } from '@/lib/game/stats/queries';
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder, TranscendTag } from '@/components/RarityFrame';
import { CharacterStage } from '@/components/CharacterStage';
import { BoastLauncher } from '@/components/BoastModal';

import { ReportButton } from './ReportButton';
import { FriendAddButton } from './FriendAddButton';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

// 집행관 구역 지역색(세계지도 REGION과 동일). 미매칭이면 인디고 폴백.
const REGION_COLOR: Record<string, string> = {
  volcano: '#ef4444',
  temple: '#60a5fa',
  swamp: '#22c55e',
  orc: '#f97316',
  kingdom: '#fbbf24',
  angel: '#c084fc',
};

/**
 * 핸들(공개 코드) → 공개 프로필 데이터(착용 세트 + KPI + 챔피언). 미존재 시 null.
 * publicCode(불변) 단일 해석 — 닉네임 폴백 없음(닉변+재취득 오귀속 방지, 아래 where 참조).
 * React cache로 generateMetadata + page render 사이 dedupe — 한 요청 내
 * DB 쿼리 1번만 실행(이전엔 무한 로딩 원인이었음, 2026-06-01).
 */
const loadProfile = cache(async (handle: string, serverId: number) => {
  const [prof] = await db
    .select({
      id: profiles.id,
      nickname: characters.nickname,
      publicCode: profiles.publicCode,
      activeProfileId: characters.activeProfileId,
    })
    .from(profiles)
    .innerJoin(
      characters,
      and(eq(characters.userId, profiles.id), eq(characters.serverId, serverId)),
    )
    // publicCode 단일 해석(감사 P-A7) — 닉네임 폴백 제거. 닉은 변경·재취득 가능이라 레거시 닉네임
    // 링크가 닉변+재취득 후 엉뚱한 유저로 오귀속되던 문제 차단(없으면 404). 신규 링크는 전부 publicCode.
    .where(eq(profiles.publicCode, handle))
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
  const [equipped, ownedAll, libMap] = await Promise.all([
    withTimeout(
      db
        .select({
          slot: catalogItems.slot,
          catalogItemId: catalogItems.id,
          code: catalogItems.code,
          name: catalogItems.name,
          enhanceLevel: userEquipment.enhanceLevel,
          transcendLevel: userEquipment.transcendLevel,
        })
        .from(userEquipment)
        .innerJoin(catalogItems, eq(userEquipment.catalogItemId, catalogItems.id))
        .where(
          and(
            eq(userEquipment.userId, prof.id),
            eq(userEquipment.serverId, serverId),
            isNotNull(userEquipment.equippedSlot),
          ),
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
          catalogItemId: userEquipment.catalogItemId,
          enhanceLevel: userEquipment.enhanceLevel,
          transcendLevel: userEquipment.transcendLevel,
        })
        .from(userEquipment)
        .where(eq(userEquipment.userId, prof.id)),
      2000,
      'u.owned',
    ).catch(
      () => [] as { catalogItemId: number; enhanceLevel: number; transcendLevel: number }[],
    ),
    withTimeout(liberatedItemRanks(prof.id, serverId), 2000, 'u.liberated').catch(
      () => new Map<number, number>(),
    ),
  ]);

  const sumEnhance = ownedAll.reduce((a, r) => a + r.enhanceLevel, 0);
  const maxEnhance = ownedAll.reduce((a, r) => Math.max(a, r.enhanceLevel), 0);
  const total = combatPowerFromOwned(ownedAll);
  // 장착 마커는 챔피언(1위)만 유지. 해방 섹션은 1~3위 전체.
  const pieces = equipped.map((e) => ({ ...e, championRank: libMap.get(e.catalogItemId) ?? null }));

  // 해방 아이템(이 플레이어가 1~3위인 카탈로그) 메타 + 등수 — sprite/name/등수뱃지.
  const libIds = [...libMap.keys()];
  const libMeta = libIds.length
    ? await withTimeout(
        db
          .select({
            id: catalogItems.id,
            slot: catalogItems.slot,
            code: catalogItems.code,
            name: catalogItems.name,
          })
          .from(catalogItems)
          .where(inArray(catalogItems.id, libIds)),
        1500,
        'u.profile.liberated',
      ).catch(() => [] as { id: number; slot: Slot; code: string; name: string }[])
    : [];
  const champItems = libMeta
    .map((c) => ({ ...c, rank: libMap.get(c.id) ?? 1 }))
    .sort((a, b) => a.rank - b.rank);

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
    guild: await getUserGuildBrief(prof.id, serverId),
  };
});

function parseServerParam(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 && n <= 32767 ? n : DEFAULT_SERVER_ID;
}
/** ?s 있으면 그 서버, 없으면 조회자 활성 서버(인앱 동일서버 링크 호환) → 비로그인 DEFAULT. */
async function resolveServerId(v: string | string[] | undefined): Promise<number> {
  const raw = Array.isArray(v) ? v[0] : v;
  if (raw == null || raw === '') return getActiveServerId();
  return parseServerParam(v);
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ nickname: string }>;
  searchParams: Promise<{ s?: string | string[] }>;
}): Promise<Metadata> {
  const { nickname: raw } = await params;
  const handle = decodeURIComponent(raw);
  const serverId = await resolveServerId((await searchParams).s);
  const data = await loadProfile(handle, serverId);
  if (!data) return { title: '인생강화' };
  // 카카오톡 공유 카드(BoastModal)와 문구 통일(2026-05-31 고정 문구 결정).
  const title = `${data.nickname} - '강화는 인생이다'`;
  let description = '인생강화에서 지금도 누군가 인생 강화중';
  try {
    const n = await getEnhancingUserCount();
    if (n > 0) description = `인생강화에서 ${n.toLocaleString('ko-KR')}명이 인생 강화중`;
  } catch {
    /* 카운트 조회 실패 시 정적 문구 유지 */
  }
  // OG는 불변 코드로 — 닉 변경/링크 캐시에도 안정. 서버는 쿼리로 전파.
  const ogImage = `/og/${encodeURIComponent(data.publicCode)}?s=${serverId}`;
  return {
    title,
    description,
    openGraph: { title, description, images: [ogImage] },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  };
}

// 해방 아이템 등수별 보더 색(금·은·동) — 추후 등수별 이펙트 차등의 시각 hook.
const RANK_BORDER: Record<number, string> = {
  1: 'border-amber-500/70',
  2: 'border-zinc-400/60',
  3: 'border-orange-500/60',
};

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
  serverId,
}: {
  userId: string;
  total: number;
  sumEnhance: number;
  maxEnhance: number;
  serverId: number;
}) {
  // 랭크는 프로필이 속한 서버 기준 — DEFAULT 하드코딩 시 서버≠1 프로필에 서버1 순위가 섞임(감사 P-A2).
  const [ranks, counts] = await Promise.all([
    getMyRanks(userId, serverId),
    getMyCountRanks(userId, serverId),
  ]);
  return (
    <section className="-mt-3 grid grid-cols-5 gap-1">
      <KpiCard label="전투력" value={fmtCompact(total)} rank={rankBadgeStreamed(ranks.combat?.rank)} />
      <KpiCard label="최고" value={fmtCompact(maxEnhance)} rank={rankBadgeStreamed(ranks.max?.rank)} />
      <KpiCard label="합산" value={fmtCompact(sumEnhance)} rank={rankBadgeStreamed(ranks.sum?.rank)} />
      <KpiCard
        label="레이드"
        value={fmtCompact(counts.raid?.value ?? 0)}
        rank={rankBadgeStreamed(counts.raid?.rank)}
      />
      <KpiCard
        label="대난투"
        value={fmtCompact(counts.melee?.value ?? 0)}
        rank={rankBadgeStreamed(counts.melee?.rank)}
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
    <section className="-mt-3 grid grid-cols-5 gap-1">
      <KpiCard label="전투력" value={fmtCompact(total)} rank="—" />
      <KpiCard label="최고" value={fmtCompact(maxEnhance)} rank="—" />
      <KpiCard label="합산" value={fmtCompact(sumEnhance)} rank="—" />
      <KpiCard label="레이드" value="—" rank="—" />
      <KpiCard label="대난투" value="—" rank="—" />
    </section>
  );
}

/**
 * "지금 인생강화는" 카드 — grow 풍 가로 4타일.
 * 전체 유저(90s) + 누적 성공/유지/하락(10분). 색 톤으로 의미 구분.
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
      <StatTile tone="live" value={`${s.totalUsers.toLocaleString('ko-KR')}명`} label="인생강화중" />
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
  searchParams,
}: {
  params: Promise<{ nickname: string }>;
  searchParams: Promise<{ s?: string | string[] }>;
}) {
  const { nickname: raw } = await params;
  const serverId = await resolveServerId((await searchParams).s);
  const data = await loadProfile(decodeURIComponent(raw), serverId);
  if (!data) notFound();

  const bySlot = new Map(data.equipped.map((e) => [e.slot, e]));
  // 조회자 + 운영자 여부를 한 번에(getAdminStatus는 미로그인 시 조회 없이 단락).
  const { userId: viewerId, isAdmin } = await getAdminStatus();
  const mode: 'guest' | 'self' | 'other' = !viewerId
    ? 'guest'
    : viewerId === data.ownerId
      ? 'self'
      : 'other';
  const canReport = mode === 'other' && !!data.profileId;

  // 친구 관계 — 로그인+타인일 때만. sendRequestAction과 동일 서버(조회자 활성 서버) 기준으로
  // 계산해 버튼 상태와 실제 요청이 어긋나지 않게 한다(친구는 서버별). 실패 시 'none' 폴백.
  let friendRelation: FriendRelation = 'none';
  if (mode === 'other') {
    friendRelation = await getFriendRelation(viewerId!, await getActiveServerId(), data.ownerId).catch(
      () => 'none' as const,
    );
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[390px] bg-zinc-950 text-zinc-50">
      {/* ── 히어로: 닉네임(머리 위) + 캐릭터 풀블리드 + 그라데이션 ── */}
      <section className="relative h-[250px] overflow-hidden bg-gradient-to-b from-amber-900/30 via-zinc-900 to-zinc-950">
        {data.charImg ? (
          <div className="absolute inset-0 flex items-end justify-center pb-[10px] pt-[15px]">
            <CharacterStage
              charSrc={data.charImg}
              scale={1.15}
              offsetY={-5}
              className="aspect-[2/3] h-full"
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-30">
            🏆
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,transparent_30%,rgba(0,0,0,0.55))]" />
        {/* 닉네임 — 상단 가운데, 아바타 머리 위. 그 아래 길드 문양+이름(있으면). */}
        <div className="absolute inset-x-0 top-3 z-10 flex flex-col items-center text-center">
          <h1 className="text-xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.7)]">
            {data.nickname}
          </h1>
          {data.guild && (
            <div className="mt-0.5 flex max-w-[88%] items-center justify-center gap-1 text-[11px] font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              {data.guild.executorZone && (
                <span className="shrink-0">
                  <span style={{ color: REGION_COLOR[data.guild.executorZoneRegion ?? ''] ?? '#a5b4fc' }}>
                    {data.guild.executorZone}
                  </span>
                  <span className="text-indigo-300"> 집행관 ·</span>
                </span>
              )}
              {data.guild.name && <span className="truncate text-white/80">{data.guild.name}</span>}
              {data.guild.emblemUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.guild.emblemUrl}
                  alt=""
                  aria-hidden
                  className="shrink-0 object-contain"
                  style={{ width: 15, height: 15, imageRendering: 'pixelated' }}
                />
              )}
            </div>
          )}
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
            serverId={serverId}
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
                  className={`relative flex aspect-square flex-col items-center justify-center gap-0.5 isolate overflow-hidden rounded-lg border-2 bg-zinc-950 px-1 text-center ${
                    hasRarityBorder(it.transcendLevel) ? '' : 'border-zinc-800'
                  }`}
                >
                  <RarityFrame level={it.transcendLevel} />
                  <TranscendSprite
                    code={it.code}
                    slot={s}
                    level={it.transcendLevel}
                    championRank={it.championRank}
                    size={48}
                    frameless
                  />
                  <span className="line-clamp-2 break-keep px-0.5 text-[9px] leading-tight text-zinc-400">
                    {it.name}
                  </span>
                  <span className="text-[9px] font-semibold text-zinc-100">
                    +{it.enhanceLevel}
                    <TranscendTag level={it.transcendLevel} className="ml-1" />
                  </span>
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
                해방 아이템
              </div>
              <div className="font-mono text-[10px] text-amber-200/80">
                {data.champItems.length}종
              </div>
            </div>
            <ul className="flex gap-1.5 overflow-x-auto overflow-y-hidden pb-0.5">
              {data.champItems.map((c) => (
                <li
                  key={c.id}
                  className={`relative aspect-square w-16 shrink-0 rounded border bg-zinc-950 ${RANK_BORDER[c.rank] ?? 'border-amber-700/60'}`}
                >
                  <div className="flex h-full w-full items-center justify-center">
                    <TranscendSprite
                      code={c.code}
                      slot={c.slot}
                      level={0}
                      championRank={c.rank}
                      size={52}
                      frameless
                    />
                  </div>
                  <span className="absolute inset-x-0 bottom-0 truncate rounded-b bg-black/60 px-0.5 text-center text-[8px] leading-tight text-zinc-200">
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
            serverId={serverId}
            nickname={data.nickname}
            publicCode={data.publicCode}
            total={data.total}
            profileImg={data.charImg}
            guildEmblemUrl={data.guild?.emblemUrl ?? null}
            guildName={data.guild?.name ?? null}
            pieces={data.equipped.map((e) => ({
              slot: e.slot,
              code: e.code,
              name: e.name,
              enhanceLevel: e.enhanceLevel,
              transcendLevel: e.transcendLevel,
              championRank: e.championRank,
            }))}
          />
        ) : null}

        {mode === 'other' ? (
          <>
            <BoastLauncher
            serverId={serverId}
              nickname={data.nickname}
              publicCode={data.publicCode}
              total={data.total}
              profileImg={data.charImg}
              guildEmblemUrl={data.guild?.emblemUrl ?? null}
              guildName={data.guild?.name ?? null}
              pieces={data.equipped.map((e) => ({
                slot: e.slot,
                code: e.code,
                name: e.name,
                enhanceLevel: e.enhanceLevel,
                transcendLevel: e.transcendLevel,
                championRank: e.championRank,
              }))}
              label="프로필 공유하기"
            />
            {/* 친구 추가 — 로그인+친구 아님일 때. friend면 렌더 안 함(요구사항). */}
            {friendRelation !== 'friend' ? (
              <FriendAddButton targetId={data.ownerId} initialRelation={friendRelation} />
            ) : null}
            {canReport ? <ReportButton profileId={data.profileId!} /> : null}
          </>
        ) : null}

        {/* 운영자 전용 — 이 유저의 관리자 상세로 바로 이동(친구/공유와 독립). */}
        {isAdmin ? (
          <Link
            href={`/admin/users?uid=${data.ownerId}`}
            className="flex w-full items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900/60 py-2.5 text-sm font-semibold text-zinc-300 transition active:scale-[0.98] hover:bg-zinc-900"
          >
            🛠️ 유저 조회
          </Link>
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
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/85 px-1 py-1.5 text-center shadow-lg shadow-black/30 backdrop-blur">
      <div className="truncate text-[7.5px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[11px] font-bold tabular-nums text-zinc-50">{value}</div>
      <div className="mt-0.5 font-mono text-[9px] tabular-nums text-amber-300">{rank}</div>
    </div>
  );
}
