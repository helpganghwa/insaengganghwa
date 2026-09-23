import 'server-only';
import { josa as fillJosa, getJosaPicker } from 'josa';

import { and, asc, eq, lt, sql } from 'drizzle-orm';

import { REGION_META, type Region } from '@/lib/game/guild/region-meta';
import { replayOwnership } from '@/lib/game/guild/conquest/chronicle-history';
import { unstable_cache, revalidateTag } from 'next/cache';
import type { EraFacts } from './era-summary';
import { readStoredEraSummaries, syncEraSummaries, type EraInput, type SyncResult } from './era-store';
import { db } from '@/lib/db/client';
import { getGuildEmblemHistory } from '@/lib/game/guild/emblem-history';
import { guilds, worldChronicle, zoneAdjacency, zones } from '@/lib/db/schema/guild';
import { computeConquestReplay } from '@/lib/game/guild/conquest/replay';
import { kstDateString } from '@/lib/kst';
import { withHistoryDb } from './db';

export type { HistoryDay, HistoryZone, HistoryGuildMeta, HistoryIndex, HistoryDayData } from './types';
import type { HistoryGuildMeta, HistoryIndex, HistoryDayData, HistoryStory, HistoryEvent } from './types';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 메인 화면 재료 — 날짜 목록·지도 기하·현재 소유·시대. 하루 한 번 바뀌는 데이터라 Next 데이터 캐시에 10분 보관(2026-09-18, G).
 * 자정 공개·어드민 요약 저장은 태그 'history-index'로 즉시 비운다. 로컬 점검 스크립트는 HISTORY_NO_CACHE=1로 직접 호출.
 */
export function loadHistoryIndex(serverId: number): Promise<HistoryIndex> {
  if (process.env.HISTORY_NO_CACHE === '1') return withHistoryDb(async () => (await buildIndexCore(serverId)).index);
  // 캐시 키에 KST 오늘 날짜를 넣는다 — 자정에 새 날이 공개되면 바로 새 항목으로(스테이징엔 공개 크론이 없어 태그 무효화가
  // 오지 않는다. 날짜 키가 없으면 최대 10분 동안 어제까지만 보인다).
  return withHistoryDb(() => cachedIndex(serverId, kstDateString()));
}
const cachedIndex = unstable_cache(async (serverId: number, _today: string) => (await buildIndexCore(serverId)).index, ['history-index-v2'], {
  revalidate: 600,
  tags: ['history-index'],
});

/** 시대 요약 동기화 재료(크론·어드민) — 사실표 + 집계 문장 + 주인 길드 id. */
export function loadEraInputs(serverId: number): Promise<EraInput[]> {
  return withHistoryDb(async () => (await buildIndexCore(serverId)).eraInputs);
}

/**
 * 어드민 검수 화면용 — 표시만 하므로 첫 화면과 같은 캐시 규칙(10분·태그 'history-index'·날짜 키)을 탄다.
 * 서버마다 전체 연대기를 다시 계산하는 일이라, 캐시 없이는 서버 수만큼 어드민 진입이 느려진다.
 * ⚠ 동기화(syncHistoryEras)는 사실표 해시를 비교하므로 반드시 캐시 없는 loadEraInputs를 쓴다.
 */
export function loadEraInputsForView(serverId: number): Promise<EraInput[]> {
  if (process.env.HISTORY_NO_CACHE === '1') return loadEraInputs(serverId);
  return withHistoryDb(() => cachedEraInputs(serverId, kstDateString()));
}
const cachedEraInputs = unstable_cache(
  async (serverId: number, _today: string) => (await buildIndexCore(serverId)).eraInputs,
  ['history-era-inputs-v1'],
  { revalidate: 600, tags: ['history-index'] },
);

/** 자정 공개 뒤·어드민에서 — 사실표가 바뀐 시대에 이야기꾼 제안을 쌓는다(정본은 그대로). 새 시대가 생기면 집계 문장이 정본으로 들어가므로 첫 화면 캐시도 비운다. */
export async function syncHistoryEras(serverId: number, opts: { force?: boolean; only?: string } = {}): Promise<SyncResult> {
  const inputs = await loadEraInputs(serverId);
  const r = await syncEraSummaries(serverId, inputs, opts);
  revalidateTag('history-index', 'max');
  return r;
}

async function buildIndexCore(serverId: number): Promise<{ index: HistoryIndex; eraInputs: EraInput[] }> {
  return (async () => {
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
    const { story, ownersByDay, guildsById, nameAliases, eraFacts } = await buildStory(
      serverId,
      days.map((d) => d.kstDay),
      zoneRows.map((z) => ({ id: z.id, name: z.name, region: String(z.region) })),
      new Map(days.map((d) => [d.kstDay, d.headline])),
    );
    // 시대 요약 — ① 저장된 정본(0202, 운영자가 적용·수정한 글) ② 없으면 집계 문장.
    // 이야기꾼 생성문은 제안으로만 쌓이고(0203) 운영자가 적용해야 정본이 된다 — 검수 전 글은 여기서 읽지 않는다.
    const eraInputs: EraInput[] = story.eras.map((e, i) => ({ facts: eraFacts[i]!, fallback: { summary: e.summary, closing: e.closing }, guildId: e.guildId }));
    const stored = await readStoredEraSummaries(serverId);
    story.eras.forEach((era, i) => {
      const row = stored.get(eraFacts[i]!.from);
      if (!row) return;
      era.summary = row.summary;
      if (row.closing) era.closing = row.closing;
    });
    const index: HistoryIndex = {
      serverId,
      days,
      zones: zoneRows.map((z) => ({ id: z.id, name: z.name, region: z.region, mapX: Number(z.mapX), mapY: Number(z.mapY) })),
      edges: edgeRows.map((e) => ({ a: e.a, b: e.b })),
      owners,
      guilds: guildMeta,
      emblemHistory,
      story,
      ownersByDay,
      guildsById,
      nameAliases,
    };
    return { index, eraInputs };
  })();
}

/**
 * 판도·시대·사건 + 날짜별 소유표(2026-09-18 개편) — 전투 승자·방치 중립화·해산을 날짜순으로 재생(chronicle-history.replayOwnership)해
 * 날마다 구역 소유를 확정하고, 그 표에서 길드별 보유 수·1위(시대)·석권·최대 영토·소멸을 전부 뽑는다.
 * 종전엔 '그날까지 마지막 승자'만 세어 중립화·해산으로 잃은 구역이 계속 보유로 잡혔고, 석권 칩은 '점령지 1위 교체' 이벤트를
 * 잘못 읽고 있었다. 이름은 그날 스냅샷(guild_refs)이 있으면 당시 이름, 없으면 현재 이름.
 */
async function buildStory(
  serverId: number,
  kstDays: string[],
  zoneRows: { id: number; name: string; region: string }[],
  headlineOf: Map<string, string>,
): Promise<{ story: HistoryStory; ownersByDay: number[][]; guildsById: HistoryIndex['guildsById']; nameAliases: Record<string, number>; eraFacts: EraFacts[] }> {
  const empty = { story: { guilds: [], counts: [], eras: [], events: {} } as HistoryStory, ownersByDay: [] as number[][], guildsById: {} as HistoryIndex['guildsById'], nameAliases: {} as Record<string, number>, eraFacts: [] as EraFacts[] };
  if (kstDays.length === 0) return empty;
  const lastDay = kstDays[kstDays.length - 1]!;
  // 소유 변화 — 승자가 있는 전투 전부. 길드가 해산하면 winner_guild_id는 FK(on delete set null)로 비워지지만
  // 이름 스냅샷(0201 winner_guild_name)은 남는다. 그런 행은 연대기 스냅샷(guild_refs)에서 가장 가까운 날의
  // 같은 이름으로 **옛 id를 되찾아** 센다. id가 빈 승리를 버리면 그 길드가 차지했던 땅이 과거 전체에 걸쳐 이전 주인의
  // 것으로 되돌아가, 길드 하나가 해산할 때마다 지난 날들의 보유 수와 시대 경계가 바뀐다
  // (2026-09-20 제국·구혼각 해산 → 9/13의 한 곳 차이가 동률이 되어 2·3장이 1장에 합쳐진 사고).
  const battleRowsRaw = (await db.execute(sql`
    select cb.battle_kst_day::text as day, z.name as zone,
      coalesce(
        cb.winner_guild_id,
        (select (r->>'id')::bigint from world_chronicle wc, jsonb_array_elements(wc.guild_refs) r
          where wc.server_id = cb.server_id and r->>'name' = cb.winner_guild_name
          order by abs(wc.kst_day - cb.battle_kst_day) limit 1)
      )::int as gid
    from conquest_battles cb join zones z on z.id = cb.zone_id
    where cb.server_id = ${serverId} and cb.battle_kst_day <= ${lastDay}
      and (cb.winner_guild_id is not null or cb.winner_guild_name is not null)
  `)) as unknown as { day: string; zone: string; gid: number | null }[];
  const battleRows = battleRowsRaw.filter((r): r is { day: string; zone: string; gid: number } => r.gid != null);
  const neutralRows = (await db.execute(sql`
    select we.detail->>'battleDay' as day, zn as zone
    from world_events we, jsonb_array_elements_text(coalesce(we.detail->'zones', '[]'::jsonb)) zn
    where we.server_id = ${serverId} and we.type = 'zone_neutralized'
    union all
    select to_char(((we.created_at at time zone 'Asia/Seoul') + interval '1 hour')::date, 'YYYY-MM-DD') as day, zn as zone
    from world_events we, jsonb_array_elements_text(coalesce(we.detail->'zones', '[]'::jsonb)) zn
    where we.server_id = ${serverId} and we.type = 'guild_disband'
  `)) as unknown as { day: string | null; zone: string }[];
  const snaps = replayOwnership([
    ...neutralRows.filter((r) => r.day).map((r) => ({ day: r.day!.slice(0, 10), zone: r.zone, guild: null, kind: 'neutral' as const })),
    ...battleRows.map((r) => ({ day: r.day.slice(0, 10), zone: r.zone, guild: String(r.gid), kind: 'battle' as const })),
  ]);
  const ownersAt = (day: string) => {
    let last: (typeof snaps)[number] | null = null;
    for (const s of snaps) if (s.day <= day) last = s;
    return last ? last.owners : new Map<string, string | null>();
  };
  const ownersByDay = kstDays.map((d) => {
    const o = ownersAt(d);
    return zoneRows.map((z) => Number(o.get(z.name) ?? 0));
  });
  const byGuild = new Map<number, number[]>();
  ownersByDay.forEach((row, i) => {
    for (const gid of row) {
      if (!gid) continue;
      const arr = byGuild.get(gid) ?? new Array<number>(kstDays.length).fill(0);
      arr[i] = (arr[i] ?? 0) + 1;
      byGuild.set(gid, arr);
    }
  });
  const ids = [...byGuild.keys()];
  if (ids.length === 0) return empty;

  // 이름·색·문양 — 현재 길드 + 스냅샷(날짜별 당시 이름; 해산 길드는 스냅샷만 남는다).
  const cur = await db
    .select({ id: guilds.id, name: guilds.name, color: guilds.emblemColor, emblemUrl: guilds.emblemUrl })
    .from(guilds)
    .where(and(eq(guilds.serverId, serverId), sql`${guilds.id} = any(${`{${ids.join(',')}}`}::int[])`));
  const curById = new Map(cur.map((g) => [Number(g.id), { name: g.name, color: g.color ?? null, emblemUrl: g.emblemUrl ?? null }]));
  const refRows = await db
    .select({ kstDay: worldChronicle.kstDay, refs: worldChronicle.guildRefs })
    .from(worldChronicle)
    .where(and(eq(worldChronicle.serverId, serverId), lt(worldChronicle.kstDay, kstDateString())));
  const snapByDay = new Map<string, Map<number, { name: string; color: string | null; emblemUrl: string | null }>>();
  const lastSnap = new Map<number, { name: string; color: string | null; emblemUrl: string | null }>();
  for (const r of refRows) {
    const m = new Map<number, { name: string; color: string | null; emblemUrl: string | null }>();
    for (const x of r.refs ?? []) {
      const v = { name: x.name, color: x.color ?? null, emblemUrl: x.emblemUrl ?? null };
      m.set(Number(x.id), v);
      lastSnap.set(Number(x.id), v);
    }
    snapByDay.set(String(r.kstDay).slice(0, 10), m);
  }
  const nameOn = (gid: number, kd: string) => snapByDay.get(kd)?.get(gid)?.name ?? curById.get(gid)?.name ?? lastSnap.get(gid)?.name ?? `#${gid}`;
  const colorOf = (gid: number) => curById.get(gid)?.color ?? lastSnap.get(gid)?.color ?? null;
  const guildsById: HistoryIndex['guildsById'] = {};
  for (const g of ids) {
    const v = curById.get(g) ?? lastSnap.get(g);
    // 이름 구간 — 스냅샷에서 이름이 바뀌는 날마다 한 칸. 스냅샷이 없는 날은 앞 구간이 이어진다.
    const namesFrom: [number, string][] = [];
    kstDays.forEach((kd, i) => {
      const nm = snapByDay.get(kd)?.get(g)?.name;
      if (nm && nm !== namesFrom[namesFrom.length - 1]?.[1]) namesFrom.push([i, nm]);
    });
    guildsById[g] = { name: v?.name ?? `#${g}`, color: v?.color ?? null, emblemUrl: v?.emblemUrl ?? null, namesFrom };
  }
  // 옛 이름 → id(개명 전 이름으로 적힌 요약·칩이 색·문양을 찾게).
  const nameAliases: Record<string, number> = {};
  for (const m of snapByDay.values()) for (const [gid, r] of m) if (ids.includes(gid)) nameAliases[r.name] = gid;

  // 차트 대상: 최대 보유 상위 6.
  const top = ids.map((g) => [g, Math.max(...byGuild.get(g)!)] as const).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([g]) => g);
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
  /** 시대 경계 재료 — 요약 문장에 쓴다. */
  const eraOpen: { prev: number | null; margin: number }[] = [];
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
    // 2위 보유 수 — '한 곳 차이로' 판정용.
    const second = Math.max(0, ...ids.filter((x) => x !== best).map((x) => byGuild.get(x)![i] ?? 0));
    if (best !== leader) {
      if (eras.length > 0) eras[eras.length - 1]!.endIdx = i - 1;
      eras.push({ startIdx: i, endIdx: kstDays.length - 1, guildId: best, name: nameOn(best, kstDays[i]!), color: colorOf(best), summary: '', closing: '' });
      eraOpen.push({ prev: leader, margin: bestN - second });
      // 등수 표현 대신 시대 어휘로(연대기 문체 규칙과 같게 — 2026-09-18 검수).
      if (leader != null) push(kstDays[i]!, { kind: 'leader', label: fillJosa(`새 시대 — ${nameOn(best, kstDays[i]!)}#{가} ${nameOn(leader, kstDays[i]!)}#{를} 제치고 가장 넓은 영토를 쥠`), short: '새 시대' });
      leader = best;
    }
  }
  // 지역 석권 — 소유표에서 직접(한 지역의 구역을 전부 한 길드가 쥔 첫날). 종전 'guild_zone_1' 이벤트는 점령지 1위 교체라 오독이었다.
  const regionLabel = (code: string) => REGION_META[code as Region]?.label ?? code;
  const regionZoneIdx = new Map<string, number[]>();
  zoneRows.forEach((z, k) => regionZoneIdx.set(String(z.region), [...(regionZoneIdx.get(String(z.region)) ?? []), k]));
  const sweeps: { dayIdx: number; gid: number; region: string }[] = [];
  for (const [region, idxs] of regionZoneIdx) {
    let prevSole: number | null = null;
    ownersByDay.forEach((row, i) => {
      const set = new Set(idxs.map((k) => row[k] ?? 0));
      const sole = set.size === 1 && [...set][0] ? [...set][0]! : null;
      if (sole && sole !== prevSole) {
        sweeps.push({ dayIdx: i, gid: sole, region });
        push(kstDays[i]!, { kind: 'sweep', label: `${nameOn(sole, kstDays[i]!)}, ${regionLabel(region)} 석권`, short: '석권' });
      }
      prevSole = sole;
    });
  }
  // 집계 사건: 최대 영토(차트 길드만), 대륙에서 사라짐(>0 → 0), 과반(첫 도달).
  const vanishes: { dayIdx: number; gid: number }[] = [];
  const half = Math.ceil(zoneRows.length / 2);
  for (const g of ids) {
    const arr = byGuild.get(g)!;
    const mx = Math.max(...arr);
    if (top.includes(g) && mx >= 10) {
      const i = arr.indexOf(mx);
      push(kstDays[i]!, { kind: 'peak', label: `${nameOn(g, kstDays[i]!)} 최대 영토 ${mx}곳`, short: `최대 ${mx}곳` });
    }
    for (let i = 1; i < arr.length; i++) {
      // 소멸은 한때 3곳 이상 가졌던 길드만(구역 하나 얻었다 잃은 길드까지 세면 소음).
      if (mx >= 3 && arr[i - 1]! > 0 && arr[i] === 0) {
        vanishes.push({ dayIdx: i, gid: g });
        push(kstDays[i]!, { kind: 'vanish', label: `${nameOn(g, kstDays[i - 1]!)}, 대륙에서 사라지다`, short: '소멸' });
      }
      if (arr[i]! >= half && arr[i - 1]! < half) push(kstDays[i]!, { kind: 'peak', label: `${nameOn(g, kstDays[i]!)}, 대륙 과반(${arr[i]}곳)`, short: '과반' });
    }
  }
  // 연대기 스냅샷에 한 번이라도 나온 길드 이름 — 해산 칩의 기준(영토·전투로 역사에 남은 길드만).
  const snapNames = new Set<string>();
  for (const m of snapByDay.values()) for (const r of m.values()) snapNames.add(r.name);
  const dayIdx = new Map(kstDays.map((d, i) => [d, i]));
  const ev = (await db.execute(sql`
    select type, detail, (created_at at time zone 'Asia/Seoul')::date::text kd
    from world_events where server_id = ${serverId} and type in ('guild_rename', 'guild_disband')
  `)) as unknown as { type: string; detail: Record<string, unknown>; kd: string }[];
  for (const e of ev) {
    const gname = String(e.detail?.guildName ?? '');
    const kd = e.kd.slice(0, 10);
    if (!dayIdx.has(kd)) continue;
    if (e.type === 'guild_rename') {
      const before = String(e.detail?.before ?? e.detail?.oldName ?? '');
      push(kd, { kind: 'rename', label: `${before}${before ? ' → ' : ''}${gname} 개명`, short: '개명' });
    } else {
      // 역사에 등장한 적 없는 길드(만들자마자 해산한 시험 길드)는 칩을 만들지 않는다.
      const zs = Array.isArray(e.detail?.zones) ? (e.detail.zones as unknown[]) : [];
      if (zs.length === 0 && !snapNames.has(gname)) continue;
      push(kd, { kind: 'disband', label: `${gname} 해산`, short: '해산' });
    }
  }

  // 시대 요약 — 코드 집계 문장(AI 없음). 여는 문장 + 그 시대의 석권·최대 영토·소멸, 맺음은 다음 시대에 넘긴 사실.
  const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
  // 조사 — josa 패키지 판정(ㄹ받침·숫자 발음·로마자, 2026-09-23). pair[0]=받침형(은·이·을·으로).
  const josa = (name: string, pair: [string, string]) => getJosaPicker(pair[0])(name);
  /** 한 장 안에서는 그 장 첫날의 이름으로 통일(장 제목과 같은 이름). 개명은 문장으로 따로 잇는다. */
  const G = (gid: number, kd: string, pair?: [string, string]) => {
    const nm = nameOn(gid, kd);
    return `{g|${nm}}${pair ? josa(nm, pair) : ''}`;
  };
  const joinKo = (xs: string[]) => xs.join('·');
  const renameRows = ev.filter((e) => e.type === 'guild_rename');
  // 헤드라인은 마커를 살리고 id만 벗긴다({g|이름|17} → {g|이름}) — 요약이 거기 나온 길드를 마커로 쓸 수 있게.
  const stripIds = (s: string) => s.replace(/\{([guz])\|([^}|]+)(?:\|[^}]*)?\}+/g, '{$1|$2}');
  const eraFacts: EraFacts[] = [];
  eras.forEach((era, k) => {
    const open = eraOpen[k]!;
    const d0 = kstDays[era.startIdx]!;
    const lines: string[] = [];
    if (open.prev == null) lines.push(`첫 점령전이 열린 ${md(d0)}, ${G(era.guildId, d0, ['이', '가'])} 대륙에서 가장 넓은 영토를 쥐었다.`);
    else lines.push(`${md(d0)}, ${G(era.guildId, d0, ['이', '가'])} ${G(open.prev, d0, ['을', '를'])} ${open.margin <= 1 ? '한 곳 차이로 ' : ''}제치고 가장 넓은 영토를 쥐었다.`);
    const inEra = (i: number) => i >= era.startIdx && i <= era.endIdx;
    // 개명 — 장 안에서 이름이 바뀌면 한 문장으로 잇는다(이후 문장은 새 이름).
    const renamedAt = new Map<number, string>();
    const factRenames: EraFacts['renames'] = [];
    for (const r of renameRows) {
      const kd = r.kd.slice(0, 10);
      const i = dayIdx.get(kd);
      if (i == null || !inEra(i)) continue;
      const before = String(r.detail?.before ?? r.detail?.oldName ?? '');
      const after = String(r.detail?.guildName ?? '');
      const gid = nameAliases[after] ?? nameAliases[before];
      if (!gid || !before || !after) continue;
      renamedAt.set(gid, kd);
      factRenames.push({ day: kd, before, after });
      lines.push(`${md(kd)} {g|${before}}${josa(before, ['은', '는'])} {g|${after}}${josa(after, ['으로', '로'])} 이름을 바꾸었다.`);
    }
    const nameIn = (gid: number, pair?: [string, string]) => G(gid, renamedAt.has(gid) ? kstDays[era.endIdx]! : d0, pair);
    const sw = sweeps.filter((s) => inEra(s.dayIdx));
    const byG = new Map<number, string[]>();
    for (const s of sw) byG.set(s.gid, [...(byG.get(s.gid) ?? []), regionLabel(s.region)]);
    for (const [gid, regs] of byG) {
      const list = joinKo([...new Set(regs)]);
      lines.push(`${nameIn(gid, ['이', '가'])} ${list}${josa(list, ['을', '를'])} 석권했다.`);
    }
    const arr = byGuild.get(era.guildId)!;
    const peak = Math.max(...arr.slice(era.startIdx, era.endIdx + 1));
    const len = era.endIdx - era.startIdx + 1;
    if (len >= 2 && peak > arr[era.startIdx]!) lines.push(`${nameIn(era.guildId)}의 영토는 최대 ${peak}곳에 이르렀다.`);
    const gone = [...new Set(vanishes.filter((v) => inEra(v.dayIdx) && (byGuild.get(v.gid)![era.endIdx] ?? 0) === 0).map((v) => v.gid))].map((gid) => G(gid, kstDays[Math.max(0, (vanishes.find((v) => v.gid === gid)?.dayIdx ?? 1) - 1)]!));
    if (gone.length > 0) lines.push(`이 시대에 ${joinKo(gone)}${josa(gone[gone.length - 1]!.replace(/\}$/, '').replace(/^\{g\|/, ''), ['이', '가'])} 대륙에서 사라졌다.`);
    era.summary = lines.join(' ');
    const next = eras[k + 1];
    if (next) {
      const to = arr[next.startIdx]!;
      era.closing = `${len}일 만에 ${G(next.guildId, kstDays[next.startIdx]!)}에게 가장 넓은 영토를 내주었다. ${peak}곳에서 ${to}곳으로.`;
    } else era.closing = '';
    // 이야기꾼 요약용 사실표 — 이름은 장 첫날 기준(개명은 항목으로), 마커 없는 평문.
    const plainName = (gid: number, kd: string) => nameOn(gid, kd);
    eraFacts.push({
      index: k + 1,
      leader: plainName(era.guildId, d0),
      leaderAtEnd: plainName(era.guildId, kstDays[era.endIdx]!),
      from: d0,
      to: kstDays[era.endIdx]!,
      days: len,
      ongoing: !next,
      prevLeader: open.prev != null ? plainName(open.prev, d0) : null,
      margin: open.margin,
      renames: factRenames,
      sweeps: sw
        .slice()
        .sort((a, b) => a.dayIdx - b.dayIdx)
        .map((s) => ({ day: kstDays[s.dayIdx]!, guild: plainName(s.gid, kstDays[s.dayIdx]!), region: regionLabel(s.region) })),
      peak: len >= 2 && peak > arr[era.startIdx]! ? peak : null,
      peakDay: len >= 2 && peak > arr[era.startIdx]! ? kstDays[era.startIdx + arr.slice(era.startIdx, era.endIdx + 1).indexOf(peak)]! : null,
      // 소멸 — 장이 끝날 때까지 돌아오지 않은 길드만(8/31 사라졌다 9/1 돌아온 케케케처럼 곧 복귀한 길드를 '사라졌다'로 쓰지 않게).
      vanished: [
        ...new Set<string>(
          vanishes
            .filter((v) => inEra(v.dayIdx) && (byGuild.get(v.gid)![era.endIdx] ?? 0) === 0)
            .map((v) => JSON.stringify({ day: kstDays[v.dayIdx]!, guild: plainName(v.gid, kstDays[Math.max(0, v.dayIdx - 1)]!) })),
        ),
      ].map((s) => JSON.parse(s) as { day: string; guild: string }),
      closing: next ? { next: plainName(next.guildId, kstDays[next.startIdx]!), peak, to: arr[next.startIdx]! } : null,
      headlines: kstDays.slice(era.startIdx, era.endIdx + 1).map((kd) => stripIds(headlineOf.get(kd) ?? '')).filter(Boolean),
    });
  });
  return { story: { guilds: guildsOut, counts, eras, events }, ownersByDay, guildsById, nameAliases, eraFacts };
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
    return { kstDay, headline: row.headline ?? '', text: row.text, replay };
  });
}

/**
 * 역사 위키의 서버 파라미터(`?s=`) — 위키는 서버 선택 UI 없이 **쿼리스트링으로만** 구분한다
 * (2026-09-21 ⑦, 사용자 확정). 없거나 이상하면 1서버.
 */
export function parseHistoryServerId(v: unknown): number {
  const n = Number(typeof v === 'string' ? v : NaN);
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : 1;
}
