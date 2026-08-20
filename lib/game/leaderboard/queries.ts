import 'server-only';

import { and, eq, gt, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { userEquipment } from '@/lib/db/schema/equipment';
import { leaderboardRanks } from '@/lib/db/schema/leaderboard';
import { combatPowerFromOwned } from '@/lib/game/equipment/combat-power';
import { getGuildBriefsByUsers } from '@/lib/game/guild/badge';

/**
 * 랭킹 — BALANCE §3.3. **시즌제 없음·상시 누적·Top 100**. 읽기는 사전계산 스냅샷(leaderboard_ranks,
 * cron이 N분마다 재계산)에서 — 유저 수와 무관하게 인덱스 조회. 무거운 전 유저 집계는 snapshot.ts(cron).
 */
export type LeaderboardMetric = 'max' | 'sum' | 'combat' | 'raid' | 'melee';
export type LeaderboardEntry = {
  userId: string;
  nickname: string;
  /** 불변 공개 코드 — /u 링크 식별자(닉 변경 무관). */
  publicCode: string;
  value: number;
  rank: number;
  /** 대표 프로필 이미지 URL(없으면 null) */
  profileImg?: string | null;
  /** 길드 문양 URL(미소속/생성중이면 null) — 닉네임 옆 노출용. */
  guildEmblemUrl?: string | null;
  /** 길드명(미소속이면 null) — 닉네임 아래 노출용. */
  guildName?: string | null;
};
const TOP = 100;
const TIMEOUT_MS = 3000;

/**
 * top entries에 대표 프로필 이미지 + 배경을 batch로 붙임(랭킹 쿼리와 분리).
 */
async function attachProfiles(serverId: number, entries: LeaderboardEntry[]): Promise<LeaderboardEntry[]> {
  if (entries.length === 0) return entries;
  let rows: { userId: string; rotations: unknown }[];
  try {
    rows = await withTimeout(
      db
        .select({
          userId: characters.userId,
          rotations: userProfiles.rotations,
        })
        .from(characters)
        .leftJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
        .where(
          and(eq(characters.serverId, serverId), inArray(characters.userId, entries.map((e) => e.userId))),
        ),
      3000,
      'leaderboard.profiles',
    );
  } catch {
    return entries.map((e) => ({ ...e, profileImg: null, guildEmblemUrl: null }));
  }
  const map = new Map(
    rows.map((r) => {
      const rot = r.rotations as Record<string, string> | null;
      const img = rot ? (rot.south ?? Object.values(rot)[0] ?? null) : null;
      return [r.userId, img] as const;
    }),
  );
  let guildMap = new Map<string, { emblemUrl: string | null; name: string }>();
  try {
    guildMap = await getGuildBriefsByUsers(entries.map((e) => e.userId), serverId);
  } catch {
    // 무시 — 문양 없이 진행.
  }
  return entries.map((e) => ({
    ...e,
    profileImg: map.get(e.userId) ?? null,
    guildEmblemUrl: guildMap.get(e.userId)?.emblemUrl ?? null,
    guildName: guildMap.get(e.userId)?.name ?? null,
  }));
}

// ── 스냅샷 읽기(인덱스, 유저 수 무관) ──

/**
 * Top-N — (server,metric,value) 인덱스로 값 내림차순 N행, 순위는 읽기 시 파생(v2).
 * 값은 증분 갱신(incremental.ts)으로 항상 신선 — rank 컬럼은 더 이상 읽지 않는다
 * (증분 upsert가 rank를 안 쓰므로 저장된 rank는 낡을 수 있음). 경쟁 순위(1,2,2,4)는
 * 페이지가 항상 최상위부터 시작하므로 페이지 내에서 정확히 계산된다.
 */
async function snapshotTop(metric: LeaderboardMetric, serverId: number, n: number): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: leaderboardRanks.userId,
      nickname: characters.nickname,
      publicCode: profiles.publicCode,
      value: leaderboardRanks.value,
    })
    .from(leaderboardRanks)
    .innerJoin(
      characters,
      and(eq(characters.userId, leaderboardRanks.userId), eq(characters.serverId, serverId)),
    )
    .innerJoin(profiles, eq(profiles.id, leaderboardRanks.userId))
    .where(and(eq(leaderboardRanks.serverId, serverId), eq(leaderboardRanks.metric, metric)))
    .orderBy(sql`${leaderboardRanks.value} desc`, leaderboardRanks.userId)
    .limit(n);
  let prevVal: number | null = null;
  let prevRank = 0;
  return rows.map((r, i) => {
    const value = Number(r.value);
    const rank = prevVal !== null && value === prevVal ? prevRank : i + 1;
    prevVal = value;
    prevRank = rank;
    return { userId: r.userId, nickname: r.nickname, publicCode: r.publicCode, value, rank };
  });
}
const safeTop = (m: LeaderboardMetric, sid: number, n: number) =>
  withTimeout(snapshotTop(m, sid, n), TIMEOUT_MS, `leaderboard.top.${m}`).catch(() => [] as LeaderboardEntry[]);

export type MyRankSnap = { value: number; rank: number } | null;

/** 내 순위 — PK 단일행으로 값 조회 후 순위는 값 파생(count(value>내값)+1, v2). 없으면 null. */
async function snapshotMyRank(metric: LeaderboardMetric, serverId: number, userId: string): Promise<MyRankSnap> {
  const [r] = await db
    .select({ value: leaderboardRanks.value })
    .from(leaderboardRanks)
    .where(
      and(
        eq(leaderboardRanks.serverId, serverId),
        eq(leaderboardRanks.metric, metric),
        eq(leaderboardRanks.userId, userId),
      ),
    )
    .limit(1);
  if (!r) return null;
  return rankByValue(metric, serverId, userId, Number(r.value));
}
const safeMyRank = (m: LeaderboardMetric, sid: number, uid: string) =>
  withTimeout(snapshotMyRank(m, sid, uid), TIMEOUT_MS, `leaderboard.mine.${m}`).catch(() => null);

/** 임의 값의 순위 — 나보다 큰 값 수 + 1((server,metric,value) 인덱스 count). 강화 직후 실시간 순위용. */
async function rankByValue(
  metric: LeaderboardMetric,
  serverId: number,
  _userId: string, // 시그니처 유지(호출부 다수) — 자기 제외는 논리적으로 불필요해 미사용.
  myValue: number,
): Promise<MyRankSnap> {
  // ne(userId)는 논리적으로 잉여(자기 값은 자기보다 클 수 없음) — 제거하면 value_idx
  // index-only 스캔이 가능해 힙 방문이 사라진다(리뷰 2026-07-07).
  // 알려진 한계: myValue가 live 재계산 값(getMyRanksAfter)이고 하락 직후 증분 훅이
  // 실패(best-effort)하면 내 낡은 상위 행이 count에 포함돼 순위가 1 나쁘게 보일 수 있다 —
  // 다음 훅/시간별 크론이 교정하는 드문 표시 오차로, 핫패스 index-only를 유지하는 쪽을 택함.
  const [c] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leaderboardRanks)
    .where(
      and(
        eq(leaderboardRanks.serverId, serverId),
        eq(leaderboardRanks.metric, metric),
        gt(leaderboardRanks.value, myValue),
      ),
    );
  return { value: myValue, rank: (c?.n ?? 0) + 1 };
}
export const LEADERBOARD_METRICS: LeaderboardMetric[] = ['max', 'sum', 'combat', 'raid', 'melee'];

/**
 * 5개 지표를 한 번에 — 랭킹 화면의 탭 전환을 무왕복으로 만들기 위한 페이로드.
 *
 * 지표별로 따로 부르면 (Top + 내값 + 내순위) × 5 + 프로필 = 20왕복이 된다. 여기서는
 * Top만 지표별로 남기고(각각 인덱스 limit 스캔이라 저렴) **내 순위 5종을 1쿼리로**,
 * **프로필·길드 batch도 5지표 합집합 1회로** 접어 7왕복으로 끝낸다 — 지표 1개만 읽던
 * 기존(4왕복)에 비해 소폭 늘지만, 탭을 누를 때마다 발생하던 페이지 전체 재요청
 * (layout 재렌더 포함)이 사라진다(2026-07-31).
 */
// 서버별 공통분(Top100×5 + 프로필 장식) 60s 캐시(2026-08-06) — 전 유저 동일 데이터인데
// 매 진입 6왕복이 나갔다. RankingTop3Card의 검증된 패턴 재사용. 유저별로 남는 건 내 순위 1왕복.
const sharedTopsCache = new Map<
  number,
  { at: number; tops: LeaderboardEntry[][]; byUser: Map<string, LeaderboardEntry> }
>();
const SHARED_TOPS_TTL_MS = 60_000;

async function loadSharedTops(serverId: number) {
  const hit = sharedTopsCache.get(serverId);
  if (hit && Date.now() - hit.at < SHARED_TOPS_TTL_MS) return hit;
  const tops = await Promise.all(LEADERBOARD_METRICS.map((m) => safeTop(m, serverId, TOP)));
  // 프로필·길드는 5지표 합집합에 대해 1회만 — 지표 간 인물이 겹쳐 중복 조회가 크다.
  const seen = new Map<string, LeaderboardEntry>();
  for (const list of tops) for (const e of list) if (!seen.has(e.userId)) seen.set(e.userId, e);
  const decorated = await attachProfiles(serverId, [...seen.values()]);
  const entry = { at: Date.now(), tops, byUser: new Map(decorated.map((e) => [e.userId, e])) };
  sharedTopsCache.set(serverId, entry);
  return entry;
}

/** 비활성 탭 미리 싣는 행 수(감사 C) — 전환은 /api/leaderboard/top이 100행을 채운다. */
export const LEADERBOARD_PREVIEW = 20;

// 순위·값은 지표별 원본을 유지하고 표시 정보만 덧입힌다(합집합 항목은 지표마다 rank가 다르다).
function decorateTop(
  top: LeaderboardEntry[],
  byUser: Map<string, LeaderboardEntry>,
): LeaderboardEntry[] {
  return top.map((e) => {
    const d = byUser.get(e.userId);
    return d
      ? { ...e, profileImg: d.profileImg, guildEmblemUrl: d.guildEmblemUrl, guildName: d.guildName }
      : e;
  });
}

export async function getLeaderboardAllPayload(
  serverId: number,
  userId: string,
  /** 지정 시(감사 C 오버패칭) 이 지표만 100행, 나머지는 PREVIEW(20)행 — 500행 → 180행.
   *  미지정은 종전 그대로 전 지표 100행(다른 호출처 호환). */
  initialMetric?: LeaderboardMetric,
): Promise<Record<LeaderboardMetric, { top: LeaderboardEntry[]; mine: MyRankSnap }>> {
  const [{ tops, byUser }, mineAll] = await Promise.all([
    loadSharedTops(serverId),
    safeMyRanksAll(serverId, userId),
  ]);

  const out = {} as Record<LeaderboardMetric, { top: LeaderboardEntry[]; mine: MyRankSnap }>;
  LEADERBOARD_METRICS.forEach((m, i) => {
    const full = decorateTop(tops[i]!, byUser);
    out[m] = {
      top: initialMetric == null || m === initialMetric ? full : full.slice(0, LEADERBOARD_PREVIEW),
      mine: mineAll[m],
    };
  });
  return out;
}

/** 단일 지표 Top100 — 탭 전환 lazy 조회(/api/leaderboard/top). loadSharedTops 60s 캐시 공유. */
export async function getLeaderboardTop(
  serverId: number,
  metric: LeaderboardMetric,
): Promise<LeaderboardEntry[]> {
  const { tops, byUser } = await loadSharedTops(serverId);
  const i = LEADERBOARD_METRICS.indexOf(metric);
  if (i < 0) return [];
  return decorateTop(tops[i]!, byUser);
}

/** 내 순위 5지표 — 값(내 행)과 순위(값 초과 개수+1)를 지표별 1행으로 한 번에. */
async function myRanksAll(
  serverId: number,
  userId: string,
): Promise<Record<LeaderboardMetric, MyRankSnap>> {
  const rows = (await db.execute(sql`
    select me.metric::text as metric,
           me.value as value,
           (select count(*) from leaderboard_ranks o
             where o.server_id = ${serverId} and o.metric = me.metric and o.value > me.value)::int as ahead
    from leaderboard_ranks me
    where me.server_id = ${serverId} and me.user_id = ${userId}::uuid
  `)) as unknown as { metric: string; value: string | number; ahead: number }[];

  const out = {} as Record<LeaderboardMetric, MyRankSnap>;
  for (const m of LEADERBOARD_METRICS) out[m] = null; // 기록 없는 지표는 null 유지
  for (const r of rows) {
    if (!LEADERBOARD_METRICS.includes(r.metric as LeaderboardMetric)) continue;
    out[r.metric as LeaderboardMetric] = { value: Number(r.value), rank: (r.ahead ?? 0) + 1 };
  }
  return out;
}
const safeMyRanksAll = (sid: number, uid: string) =>
  withTimeout(myRanksAll(sid, uid), TIMEOUT_MS, 'leaderboard.mineAll').catch(() => {
    const out = {} as Record<LeaderboardMetric, MyRankSnap>;
    for (const m of LEADERBOARD_METRICS) out[m] = null;
    return out;
  });

/** 홈 카드 등 — userId 무관 Top N. */
export async function getRankingTop(
  metric: LeaderboardMetric,
  serverId: number,
  n: number,
): Promise<LeaderboardEntry[]> {
  const rows = await safeTop(metric, serverId, n);
  return attachProfiles(serverId, rows);
}

export type MyRanks = { max: MyRankSnap; sum: MyRankSnap; combat: MyRankSnap };

/** 강화 직전 — 스냅샷의 본인 3 메트릭 순위. myRanksAll 단일 쿼리 재사용(6왕복→1, 2026-08-20).
 *  의미 동일: 값=내 스냅샷 행, 순위=count(value>내값)+1, 행 없으면 null. */
export async function getMyRanks(userId: string, serverId: number): Promise<MyRanks> {
  const all = await safeMyRanksAll(serverId, userId);
  return { max: all.max, sum: all.sum, combat: all.combat };
}

/** 프로필 상세용 — 레이드 처치·대난투 우승 본인 순위. */
export type MyCountRanks = { raid: MyRankSnap; melee: MyRankSnap };
export async function getMyCountRanks(userId: string, serverId: number): Promise<MyCountRanks> {
  const [raid, melee] = await Promise.all([
    safeMyRank('raid', serverId, userId),
    safeMyRank('melee', serverId, userId),
  ]);
  return { raid, melee };
}

/**
 * 강화 직후 — 본인의 새 stat은 DB에서 직접 read(내 장비만), 순위는 스냅샷에 count(value>내값)+1.
 * 본인 값은 실시간, 타 유저는 스냅샷 시점 — 강화 직후 순위 변동 즉시 반영(스냅샷 전체 리스트 불필요).
 */
export async function getMyRanksAfter(userId: string, serverId: number): Promise<MyRanks> {
  const eqRows = await db
    .select({
      catalogItemId: userEquipment.catalogItemId,
      enhanceLevel: userEquipment.enhanceLevel,
      transcendLevel: userEquipment.transcendLevel,
    })
    .from(userEquipment)
    .where(and(eq(userEquipment.userId, userId), eq(userEquipment.serverId, serverId)));
  const myMax = eqRows.reduce((acc, r) => Math.max(acc, r.enhanceLevel), 0);
  const mySum = eqRows.reduce((acc, r) => acc + r.enhanceLevel, 0);
  const myCombat = Math.round(combatPowerFromOwned(eqRows));

  // 3메트릭 순위 count를 VALUES 조인 단일 쿼리로 — 병렬 3왕복→1(2026-08-20).
  // metric은 text 컬럼이라 캐스팅 없이 (server_id, metric, value) 인덱스 count 유지.
  const wanted: [LeaderboardMetric, number][] = [];
  if (myMax > 0) wanted.push(['max', myMax]);
  if (mySum > 0) wanted.push(['sum', mySum]);
  if (eqRows.length > 0) wanted.push(['combat', myCombat]);
  const out: MyRanks = { max: null, sum: null, combat: null };
  if (wanted.length === 0) return out;

  try {
    const valuesSql = sql.join(
      wanted.map(([m, v]) => sql`(${m}, ${v}::bigint)`),
      sql`, `,
    );
    const rows = (await withTimeout(
      db.execute(sql`
        select m.metric, m.val,
               (select count(*) from leaderboard_ranks o
                 where o.server_id = ${serverId} and o.metric = m.metric and o.value > m.val)::int as ahead
        from (values ${valuesSql}) as m(metric, val)
      `),
      TIMEOUT_MS,
      'leaderboard.after',
    )) as unknown as { metric: string; val: string | number; ahead: number }[];
    for (const r of rows) {
      const m = r.metric as 'max' | 'sum' | 'combat';
      out[m] = { value: Number(r.val), rank: (r.ahead ?? 0) + 1 };
    }
  } catch {
    // 기존 per-metric catch(null)와 동일한 강등 — 토스트만 생략된다.
  }
  return out;
}
