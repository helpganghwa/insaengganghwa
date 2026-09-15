import 'server-only';

import { and, asc, eq, lt } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, worldChronicle, zoneAdjacency, zones } from '@/lib/db/schema/guild';
import { computeConquestReplay } from '@/lib/game/guild/conquest/replay';
import { kstDateString } from '@/lib/kst';
import { withHistoryDb } from './db';

export type { HistoryDay, HistoryZone, HistoryGuildMeta, HistoryIndex, HistoryDayData } from './types';
import type { HistoryGuildMeta, HistoryIndex, HistoryDayData } from './types';

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
      if (z.owner) guildMeta[z.owner] = { color: z.color ?? null, emblemUrl: z.emblemUrl ?? null };
    }
    return {
      serverId,
      days: dayRows.map((r) => ({ kstDay: String(r.kstDay).slice(0, 10), headline: r.headline ?? '' })),
      zones: zoneRows.map((z) => ({ id: z.id, name: z.name, region: z.region, mapX: Number(z.mapX), mapY: Number(z.mapY) })),
      edges: edgeRows.map((e) => ({ a: e.a, b: e.b })),
      owners,
      guilds: guildMeta,
    };
  });
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
