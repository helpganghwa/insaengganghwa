import 'server-only';

import { cache } from 'react';
import { asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, worldChronicle } from '@/lib/db/schema/guild';

/**
 * 길드 문양 이력(2026-09-16) — 길드 id → 문양 URL을 연대기 스냅샷(guild_refs)에 처음 등장한 순서로, 끝에 현재 문양.
 * 옛 회차·연대기 스냅샷이 박제한 문양 파일은 보관함 삭제로 사라질 수 있다(스토리지 400). 그때 화면이 그 길드의
 * **다음 문양**으로 넘어가게 하는 후보 목록이다(「전설」 8/24~8/28 첫 문양 유실 → 두 번째 문양). guild_emblems 표를 읽지
 * 않는 이유: 스테이징의 프로덕션 읽기 전용 역할이 그 표를 못 보며, 스냅샷 + 현재 문양만으로 충분하다. 요청 안에서 캐시.
 */
export const getGuildEmblemHistory = cache(async (serverId: number): Promise<Record<number, string[]>> => {
  const out: Record<number, string[]> = {};
  const push = (id: number, url: string | null | undefined) => {
    if (!url) return;
    const list = (out[id] ??= []);
    if (!list.includes(url)) list.push(url);
  };
  const refRows = await db
    .select({ refs: worldChronicle.guildRefs })
    .from(worldChronicle)
    .where(eq(worldChronicle.serverId, serverId))
    .orderBy(asc(worldChronicle.kstDay));
  for (const r of refRows) for (const x of r.refs ?? []) push(Number(x.id), x.emblemUrl);
  const cur = await db.select({ id: guilds.id, emblemUrl: guilds.emblemUrl }).from(guilds).where(eq(guilds.serverId, serverId));
  for (const g of cur) push(Number(g.id), g.emblemUrl);
  return out;
});

/** 문양 URL 경로의 길드 id(`…/guild-emblems/<id>/<file>`). 스냅샷엔 id가 없어 URL에서 읽는다. */
export function guildIdFromEmblemUrl(url: string | null | undefined): number | null {
  const m = url?.match(/\/guild-emblems\/(\d+)\//);
  return m ? Number(m[1]) : null;
}

/** 스냅샷 URL이 안 열릴 때 차례로 시도할 후보 — 이력에서 그 URL **다음** 문양들(이력에 없으면 그 URL을 뺀 이력 전체). */
export function emblemAlsoTry(url: string | null | undefined, history: Record<number, string[]>): string[] {
  if (!url) return [];
  const id = guildIdFromEmblemUrl(url);
  if (id == null) return [];
  const hist = history[id] ?? [];
  const k = hist.indexOf(url);
  return k >= 0 ? hist.slice(k + 1) : hist.filter((u) => u !== url);
}
