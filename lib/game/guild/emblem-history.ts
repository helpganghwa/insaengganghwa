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
/** 문양 파일 생존 캐시(프로세스 단위, 1시간) — 사라진 옛 문양 URL은 목록에서 빼서 클라이언트가 느린 실패를 기다리지 않게 한다. */
const alive = new Map<string, { ok: boolean; at: number }>();
const ALIVE_TTL_MS = 60 * 60_000;
async function checkAlive(url: string): Promise<boolean> {
  const c = alive.get(url);
  if (c && Date.now() - c.at < ALIVE_TTL_MS) return c.ok;
  let ok = true;
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(2500) });
    ok = r.ok;
  } catch {
    ok = true; // 네트워크 문제는 살아 있다고 본다(클라이언트 체인이 다시 판단)
  }
  alive.set(url, { ok, at: Date.now() });
  return ok;
}
/** 캐시 기준 생존 여부(모르면 살아 있음). getGuildEmblemHistory 뒤에 부르면 그 서버의 URL은 전부 판정돼 있다. */
export function isEmblemAlive(url: string | null | undefined): boolean {
  if (!url) return false;
  return alive.get(url)?.ok ?? true;
}

export const getGuildEmblemHistory = cache(
  async (serverId: number): Promise<Record<number, string[]>> => {
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
    const cur = await db
      .select({ id: guilds.id, emblemUrl: guilds.emblemUrl })
      .from(guilds)
      .where(eq(guilds.serverId, serverId));
    for (const g of cur) push(Number(g.id), g.emblemUrl);
    // 사라진 파일 제거 — 서버에서 한 번 확인(캐시)하면 지도 타일·본문·이동 문양이 첫 시도부터 살아 있는 문양을 쓴다.
    const urls = [...new Set(Object.values(out).flat())];
    await Promise.all(urls.map((u) => checkAlive(u)));
    for (const id of Object.keys(out))
      out[Number(id)] = out[Number(id)]!.filter((u) => isEmblemAlive(u));
    return out;
  },
);

/** 문양 URL 경로의 길드 id(`…/guild-emblems/<id>/<file>`). 스냅샷엔 id가 없어 URL에서 읽는다. */
export function guildIdFromEmblemUrl(url: string | null | undefined): number | null {
  const m = url?.match(/\/guild-emblems\/(\d+)\//);
  return m ? Number(m[1]) : null;
}

/** 스냅샷 URL이 안 열릴 때 차례로 시도할 후보 — 이력에서 그 URL **다음** 문양들(이력에 없으면 그 URL을 뺀 이력 전체). */
export function emblemAlsoTry(
  url: string | null | undefined,
  history: Record<number, string[]>,
): string[] {
  if (!url) return [];
  const id = guildIdFromEmblemUrl(url);
  if (id == null) return [];
  const hist = history[id] ?? [];
  const k = hist.indexOf(url);
  return k >= 0 ? hist.slice(k + 1) : hist.filter((u) => u !== url);
}
