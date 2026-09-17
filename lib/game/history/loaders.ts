import 'server-only';

import { and, asc, eq, lt, sql } from 'drizzle-orm';

import { aggregateConquestDay } from '@/lib/game/guild/conquest/chronicle';
import { REGION_META, type Region } from '@/lib/game/guild/region-meta';
import { db } from '@/lib/db/client';
import { getGuildEmblemHistory } from '@/lib/game/guild/emblem-history';
import { guilds, worldChronicle, zoneAdjacency, zones } from '@/lib/db/schema/guild';
import { computeConquestReplay } from '@/lib/game/guild/conquest/replay';
import { kstDateString } from '@/lib/kst';
import { withHistoryDb } from './db';

export type { HistoryDay, HistoryZone, HistoryGuildMeta, HistoryIndex, HistoryDayData } from './types';
import type { HistoryGuildMeta, HistoryIndex, HistoryDayData, HistoryStory, HistoryEvent, HistoryScene } from './types';
import type { ConquestReplay } from '@/lib/game/guild/conquest/replay';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 메인 화면 재료 — 날짜 목록·지도 기하·현재 소유. 프로덕션 데이터 기준 수 KB. */
export function loadHistoryIndex(serverId: number): Promise<HistoryIndex> {
  return withHistoryDb(async () => {
    const today = kstDateString();
    const dayRows = await db
      .select({ kstDay: worldChronicle.kstDay, headline: worldChronicle.headline })
      .from(worldChronicle)
      .where(and(eq(worldChronicle.serverId, serverId), lt(worldChronicle.kstDay, today)))
      .orderBy(asc(worldChronicle.kstDay));
    const zoneRows = await db
      .select({
        id: zones.id,
        name: zones.name,
        region: zones.region,
        mapX: zones.mapX,
        mapY: zones.mapY,
        owner: guilds.name,
        ownerId: guilds.id,
        color: guilds.emblemColor,
        emblemUrl: guilds.emblemUrl,
      })
      .from(zones)
      .leftJoin(guilds, eq(guilds.id, zones.ownerGuildId))
      .where(eq(zones.serverId, serverId))
      .orderBy(asc(zones.id));
    // 인접 표는 서버 컬럼이 없다 — 구역 id가 서버별 시드라 zone_a의 서버로 거른다.
    const edgeRows = await db
      .select({ a: zoneAdjacency.zoneA, b: zoneAdjacency.zoneB })
      .from(zoneAdjacency)
      .innerJoin(zones, eq(zones.id, zoneAdjacency.zoneA))
      .where(eq(zones.serverId, serverId));
    const owners: Record<number, string | null> = {};
    const guildMeta: Record<string, HistoryGuildMeta> = {};
    for (const z of zoneRows) {
      owners[z.id] = z.owner ?? null;
      if (z.owner) guildMeta[z.owner] = { color: z.color ?? null, emblemUrl: z.emblemUrl ?? null, id: z.ownerId != null ? Number(z.ownerId) : null };
    }
    const emblemHistory = await getGuildEmblemHistory(serverId);
    const days = dayRows.map((r) => ({ kstDay: String(r.kstDay).slice(0, 10), headline: r.headline ?? '' }));
    const story = await buildStory(serverId, days.map((d) => d.kstDay), zoneRows.length);
    return {
      serverId,
      days,
      zones: zoneRows.map((z) => ({ id: z.id, name: z.name, region: z.region, mapX: Number(z.mapX), mapY: Number(z.mapY) })),
      edges: edgeRows.map((e) => ({ a: e.a, b: e.b })),
      owners,
      guilds: guildMeta,
      emblemHistory,
      story,
    };
  });
}

/**
 * 판도·시대·사건(A안) — 날짜별 종료 소유(그날까지의 마지막 전투 승자)를 길드별로 세고, 1위(길드 id)가 바뀌는 날로
 * 시대를 자르며, 사건 칩은 world_events(석권·개명·해산·전력 1위)와 집계(최대 영토·대륙에서 사라짐·1위 교체)에서 만든다.
 * 이름은 그날 스냅샷(guild_refs)이 있으면 당시 이름, 없으면 현재 이름.
 */
async function buildStory(serverId: number, kstDays: string[], zoneCount: number): Promise<HistoryStory> {
  const empty: HistoryStory = { guilds: [], counts: [], eras: [], events: {} };
  if (kstDays.length === 0) return empty;
  const rows = (await db.execute(sql`
    with days as (select unnest(${`{${kstDays.join(',')}}`}::date[]) d),
    own as (
      select dd.d, z.id zone,
        (select b.winner_guild_id from conquest_battles b
          where b.zone_id = z.id and b.server_id = ${serverId} and b.battle_kst_day <= dd.d and b.winner_guild_id is not null
          order by b.battle_kst_day desc, b.id desc limit 1) g
      from days dd cross join zones z where z.server_id = ${serverId})
    select o.d::text kd, o.g::int gid, count(*)::int n from own o where o.g is not null group by 1, 2
  `)) as unknown as { kd: string; gid: number; n: number }[];
  const dayIdx = new Map(kstDays.map((d, i) => [d, i]));
  const byGuild = new Map<number, number[]>();
  for (const r of rows) {
    const i = dayIdx.get(r.kd.slice(0, 10));
    if (i == null) continue;
    const arr = byGuild.get(r.gid) ?? new Array<number>(kstDays.length).fill(0);
    arr[i] = r.n;
    byGuild.set(r.gid, arr);
  }
  const ids = [...byGuild.keys()];
  if (ids.length === 0) return empty;
  // 이름·색 — 현재 길드 + 스냅샷(날짜별 당시 이름).
  const cur = await db
    .select({ id: guilds.id, name: guilds.name, color: guilds.emblemColor })
    .from(guilds)
    .where(and(eq(guilds.serverId, serverId), sql`${guilds.id} = any(${`{${ids.join(',')}}`}::int[])`));
  const curById = new Map(cur.map((g) => [Number(g.id), { name: g.name, color: g.color ?? null }]));
  const refRows = await db
    .select({ kstDay: worldChronicle.kstDay, refs: worldChronicle.guildRefs })
    .from(worldChronicle)
    .where(and(eq(worldChronicle.serverId, serverId), lt(worldChronicle.kstDay, kstDateString())));
  const snapByDay = new Map<string, Map<number, { name: string; color: string | null }>>();
  let lastSnap = new Map<number, { name: string; color: string | null }>();
  for (const r of refRows) {
    const m = new Map<number, { name: string; color: string | null }>();
    for (const x of r.refs ?? []) m.set(Number(x.id), { name: x.name, color: x.color ?? null });
    snapByDay.set(String(r.kstDay).slice(0, 10), m);
    lastSnap = m;
  }
  const nameOn = (gid: number, kd: string) => snapByDay.get(kd)?.get(gid)?.name ?? curById.get(gid)?.name ?? lastSnap.get(gid)?.name ?? `#${gid}`;
  const colorOf = (gid: number) => curById.get(gid)?.color ?? lastSnap.get(gid)?.color ?? null;

  // 차트 대상: 최대 보유 상위 6.
  const top = ids.map((g) => [g, Math.max(...byGuild.get(g)!)] as const).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([g]) => g);
  // 차트 범례 이름 — 개명한 길드는 「처음 이름→지금 이름」으로(선 하나가 두 이름을 잇는다는 걸 보여 준다).
  const guildsOut = top.map((g) => {
    const arr = byGuild.get(g)!;
    const firstIdx = Math.max(0, arr.findIndex((n) => n > 0));
    const first = nameOn(g, kstDays[firstIdx]!);
    const now = curById.get(g)?.name ?? lastSnap.get(g)?.name ?? `#${g}`;
    return { id: g, name: first !== now ? `${first}→${now}` : now, color: colorOf(g) };
  });
  const counts = kstDays.map((_d, i) => top.map((g) => byGuild.get(g)![i] ?? 0));

  // 시대: 일별 1위(동률이면 전날 1위 유지) → id가 바뀌는 날이 경계.
  const eras: HistoryStory['eras'] = [];
  const events: Record<string, HistoryEvent[]> = {};
  const push = (kd: string, e: HistoryEvent) => (events[kd] ??= []).push(e);
  let leader: number | null = null;
  for (let i = 0; i < kstDays.length; i++) {
    let best: number | null = null;
    let bestN = -1;
    for (const g of ids) {
      const n = byGuild.get(g)![i] ?? 0;
      if (n > bestN || (n === bestN && g === leader)) {
        best = g;
        bestN = n;
      }
    }
    if (best == null || bestN === 0) continue;
    if (best !== leader) {
      if (eras.length > 0) eras[eras.length - 1]!.endIdx = i - 1;
      eras.push({ startIdx: i, endIdx: kstDays.length - 1, guildId: best, name: nameOn(best, kstDays[i]!), color: colorOf(best) });
      if (leader != null) push(kstDays[i]!, { kind: 'leader', label: `1위 교체 — ${nameOn(leader, kstDays[i]!)} → ${nameOn(best, kstDays[i]!)}`, short: '1위 교체' });
      leader = best;
    }
  }
  // 집계 사건: 최대 영토(차트 길드만), 대륙에서 사라짐(>0 → 0), 과반(26곳 이상 첫 도달).
  for (const g of ids) {
    const arr = byGuild.get(g)!;
    const mx = Math.max(...arr);
    if (top.includes(g) && mx >= 10) {
      const i = arr.indexOf(mx);
      push(kstDays[i]!, { kind: 'peak', label: `${nameOn(g, kstDays[i]!)} 최대 영토 ${mx}곳`, short: `최대 ${mx}곳` });
    }
    for (let i = 1; i < arr.length; i++) {
      // 소멸은 한때 3곳 이상 가졌던 길드만(구역 하나 얻었다 잃은 길드까지 세면 소음).
      if (mx >= 3 && arr[i - 1]! > 0 && arr[i] === 0) push(kstDays[i]!, { kind: 'vanish', label: `${nameOn(g, kstDays[i - 1]!)}, 대륙에서 사라지다`, short: '소멸' });
      if (arr[i]! >= Math.ceil(zoneCount / 2) && arr[i - 1]! < Math.ceil(zoneCount / 2)) push(kstDays[i]!, { kind: 'peak', label: `${nameOn(g, kstDays[i]!)}, 대륙 과반(${arr[i]}곳)`, short: '과반' });
    }
  }
  // 연대기 스냅샷에 한 번이라도 나온 길드 이름 — 해산 칩의 기준(영토·전투로 역사에 남은 길드만).
  const snapNames = new Set<string>();
  for (const m of snapByDay.values()) for (const r of m.values()) snapNames.add(r.name);
  // world_events: 석권(자정 공개 이벤트라 전투일 = 전날), 개명, 해산.
  const ev = (await db.execute(sql`
    select type, detail, (created_at at time zone 'Asia/Seoul')::date::text kd, ((created_at at time zone 'Asia/Seoul')::date - interval '1 day')::date::text prev
    from world_events where server_id = ${serverId} and type in ('guild_zone_1', 'guild_rename', 'guild_disband')
  `)) as unknown as { type: string; detail: Record<string, unknown>; kd: string; prev: string }[];
  for (const e of ev) {
    const gname = String(e.detail?.guildName ?? '');
    if (e.type === 'guild_zone_1') {
      const kd = dayIdx.has(e.prev.slice(0, 10)) ? e.prev.slice(0, 10) : e.kd.slice(0, 10);
      if (dayIdx.has(kd)) push(kd, { kind: 'sweep', label: `${gname}, 지역 석권`, short: '석권' });
    } else if (e.type === 'guild_rename') {
      const kd = e.kd.slice(0, 10);
      if (dayIdx.has(kd)) push(kd, { kind: 'rename', label: `${String(e.detail?.oldName ?? e.detail?.from ?? '')}${e.detail?.oldName || e.detail?.from ? ' → ' : ''}${gname} 개명`, short: '개명' });
    } else if (e.type === 'guild_disband') {
      // 역사에 등장한 적 없는 길드(만들자마자 해산한 시험 길드 — 8/24 「세계」「길드생성」)는 칩을 만들지 않는다.
      const zones = Array.isArray(e.detail?.zones) ? (e.detail.zones as unknown[]) : [];
      if (zones.length === 0 && !snapNames.has(gname)) continue;
      const kd = e.kd.slice(0, 10);
      if (dayIdx.has(kd)) push(kd, { kind: 'disband', label: `${gname} 해산`, short: '해산' });
    }
  }
  return { guilds: guildsOut, counts, eras, events };
}

/** 하루치 — 본문·헤드라인·리플레이 스크립트(캐시 없는 계산; API 응답은 CDN 캐시). 미공개·없는 날은 null. */
export function loadHistoryDay(serverId: number, kstDay: string): Promise<HistoryDayData | null> {
  if (!DAY_RE.test(kstDay)) return Promise.resolve(null);
  return withHistoryDb(async () => {
    const today = kstDateString();
    if (kstDay >= today) return null;
    const [row] = await db
      .select({ headline: worldChronicle.headline, text: worldChronicle.todayText })
      .from(worldChronicle)
      .where(and(eq(worldChronicle.serverId, serverId), eq(worldChronicle.kstDay, kstDay)))
      .limit(1);
    if (!row) return null;
    const replay = await computeConquestReplay(serverId, kstDay);
    const scene = await buildScene(serverId, kstDay, row.headline ?? '', replay).catch(() => null);
    return { kstDay, headline: row.headline ?? '', text: row.text, replay, scene };
  });
}

const stripMarkers = (s: string) => s.replace(/\{[guz]\|([^}|]+)(?:\|[^}]*)?\}+/g, '$1');

/**
 * 그날의 장면 — 집계(aggregateConquestDay)와 리플레이 종료 상태로 하루의 가장 큰 사건 하나를 고른다.
 * 석권(그날 점령이 있었던 지역을 한 길드가 전부 보유) > 1위 교체(시작 대비 종료 1위) > 격전(crowds) > 소수 승리(underdog) > 활약(feats) > 헤드라인.
 */
async function buildScene(serverId: number, kstDay: string, headline: string, replay: ConquestReplay | null): Promise<HistoryScene | null> {
  const s = await aggregateConquestDay(kstDay, serverId);
  const zoneRows = await db
    .select({ id: zones.id, name: zones.name, region: zones.region })
    .from(zones)
    .where(eq(zones.serverId, serverId));
  const regionOf = new Map(zoneRows.map((z) => [z.name, String(z.region)]));
  const label = (code: string | null) => (code && code in REGION_META ? REGION_META[code as Region].label : code);
  const gmeta = (names: (string | null | undefined)[]) =>
    [...new Set(names.filter((x): x is string => !!x))].slice(0, 3).map((name) => {
      const g = replay?.guilds[name];
      return { name, color: g?.color ?? null, emblemUrl: g?.emblemUrl ?? null, emblemAlsoTry: g?.emblemAlsoTry };
    });
  const hero = s.feats.length > 0 && s.feats[0]!.count >= 2
    ? { nickname: s.feats[0]!.nickname, code: s.feats[0]!.publicCode, guild: s.feats[0]!.guild, kind: s.feats[0]!.kind, count: s.feats[0]!.count }
    : null;

  // 종료 소유(리플레이 시작 상태 + 그날 점령) → 지역별 석권·1위.
  if (replay) {
    const owner = new Map<number, string | null>(Object.entries(replay.beforeOwner).map(([k, v]) => [Number(k), v]));
    for (const ev of Object.values(replay.events)) if (ev.type === 'capture') owner.set(ev.zoneId, ev.winner);
    const byRegion = new Map<string, { total: number; byGuild: Map<string, number> }>();
    for (const z of zoneRows) {
      const r = byRegion.get(String(z.region)) ?? { total: 0, byGuild: new Map() };
      r.total += 1;
      const o = owner.get(z.id);
      if (o) r.byGuild.set(o, (r.byGuild.get(o) ?? 0) + 1);
      byRegion.set(String(z.region), r);
    }
    const capturedRegions = new Set(s.captures.map((c) => regionOf.get(c.zone)).filter((x): x is string => !!x));
    for (const [code, r] of byRegion) {
      if (!capturedRegions.has(code)) continue;
      for (const [g, n] of r.byGuild) {
        if (n === r.total && r.total >= 3) {
          return { kind: 'sweep', title: `${label(code)} 석권`, note: `${g}가 ${label(code)} ${r.total}곳을 모두 깃발 아래 두었다`, region: code, regionLabel: label(code), zone: null, guilds: gmeta([g]), hero };
        }
      }
    }
    const count = (m: Map<number, string | null>) => {
      const c = new Map<string, number>();
      for (const g of m.values()) if (g) c.set(g, (c.get(g) ?? 0) + 1);
      return [...c.entries()].sort((a, b) => b[1] - a[1]);
    };
    const before = count(new Map(Object.entries(replay.beforeOwner).map(([k, v]) => [Number(k), v])));
    const after = count(owner);
    if (after[0] && before[0] && after[0][0] !== before[0][0]) {
      const [g, n] = after[0];
      const biggest = s.captures.filter((c) => c.winner === g)[0];
      const code = biggest ? (regionOf.get(biggest.zone) ?? null) : null;
      return { kind: 'leader', title: '대륙 1위 교체', note: `${before[0][0]}를 제치고 ${g}가 ${n}곳으로 가장 넓은 영토를 쥐었다`, region: code, regionLabel: label(code), zone: biggest?.zone ?? null, guilds: gmeta([g, before[0][0]]), hero };
    }
  }
  if (s.crowds.length > 0) {
    const c = [...s.crowds].sort((a, b) => b.total - a.total)[0]!;
    const code = regionOf.get(c.zone) ?? null;
    const atk = c.attackers.map((a) => `${a.guild} ${a.n}`).join('·');
    return { kind: 'clash', title: `${c.zone} 격전`, note: `${atk}이 ${c.defenders}의 수비를 ${c.held ? '뚫지 못했다' : '무너뜨렸다'}`, region: code, regionLabel: label(code), zone: c.zone, guilds: gmeta([c.owner, ...c.attackers.map((a) => a.guild)]), hero };
  }
  if (s.underdogDefenses.length > 0 || s.underdogCaptures.length > 0) {
    const d = s.underdogDefenses[0];
    if (d) {
      const code = regionOf.get(d.zone) ?? null;
      return { kind: 'underdog', title: `${d.zone}의 수비`, note: `${d.defenders}이 ${d.attackerTotal}을 막아냈다`, region: code, regionLabel: label(code), zone: d.zone, guilds: gmeta([d.owner, ...d.attackers.map((a) => a.guild)]), hero };
    }
  }
  if (hero) {
    const z = s.feats[0]!.zones[0] ?? null;
    const code = z ? (regionOf.get(z) ?? null) : null;
    return { kind: 'hero', title: `${hero.nickname}의 ${hero.kind} ${hero.count}`, note: z ? `${z}에서 ${hero.guild}의 ${hero.nickname}이 ${hero.kind} ${hero.count}` : `${hero.guild}의 ${hero.nickname}`, region: code, regionLabel: label(code), zone: z, guilds: gmeta([hero.guild]), hero };
  }
  const first = s.captures[0];
  const code = first ? (regionOf.get(first.zone) ?? null) : null;
  return { kind: 'headline', title: stripMarkers(headline), note: first ? `${first.winner}가 ${first.zone}을 얻었다` : '', region: code, regionLabel: label(code), zone: first?.zone ?? null, guilds: gmeta(first ? [first.winner] : []), hero };
}
