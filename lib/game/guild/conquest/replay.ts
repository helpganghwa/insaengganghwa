import 'server-only';

import { inArray, sql as dsql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds } from '@/lib/db/schema/guild';

import { aggregateConquestDay } from './chronicle';

/**
 * 세계지도 '오늘의 역사' 리플레이 스크립트(2026-07-16 확정 연출) — 연대기 타이핑이
 * {z|구역} 마커에 도달하면 클라가 이 스크립트의 해당 구역 이벤트를 재생한다:
 * 문장 진군(영지 보유=최근접 보유 구역에서 / 무영지=지도 밖) → 격돌(경합/방어) → 점령 플래시.
 * 데이터는 전부 서버 계산(집계·이전 소유 복원·출발지 산출) — 클라는 재생만.
 */

export type ReplayGuild = { color: string | null; emblemUrl: string | null };

export type ReplayEvent = {
  zoneId: number;
  zone: string;
  type: 'capture' | 'defense';
  /** 승자(점령자 또는 방어 성공한 소유 길드). */
  winner: string;
  /** capture 시 이전 소유(무주지 null). */
  from: string | null;
  /** 패배한 공격 길드들(경합 상대 또는 방어전 공격자). */
  rivals: string[];
  /** 길드별 출발 구역 id — null이면 무영지(지도 밖 등장). */
  origins: Record<string, number | null>;
};

export type ConquestReplay = {
  kstDay: string;
  guilds: Record<string, ReplayGuild>;
  /** 구역명 → 이벤트(연대기 마커 트리거용). */
  events: Record<string, ReplayEvent>;
  /** 리플레이 시작 시점의 소유 상태(구역 id → 길드명 | null) — 종료 상태는 현재 DB와 일치. */
  beforeOwner: Record<number, string | null>;
};

export async function getConquestReplay(serverId: number): Promise<ConquestReplay | null> {
  // 연대기와 동일한 '최신 공개일' — 읽기 게이트(kst_day < 오늘 KST)와 정합.
  const [row] = (await db.execute(dsql`
    select kst_day::text d from world_chronicle
    where server_id = ${serverId} and kst_day < (now() at time zone 'Asia/Seoul')::date
    order by kst_day desc limit 1
  `)) as unknown as { d: string }[];
  if (!row) return null;
  const kstDay = row.d.slice(0, 10);

  const s = await aggregateConquestDay(kstDay, serverId);
  if (s.captures.length === 0 && s.defenses.length === 0) return null;

  // 구역 메타(id·좌표·현 소유 길드명) — 이름 매칭·이전 소유 복원·출발지 계산용.
  const zoneRows = (await db.execute(dsql`
    select z.id, z.name, z.map_x, z.map_y, g.name as owner
    from zones z left join guilds g on g.id = z.owner_guild_id
    where z.server_id = ${serverId}
  `)) as unknown as { id: number; name: string; map_x: number; map_y: number; owner: string | null }[];
  const byName = new Map(zoneRows.map((z) => [z.name, z]));

  // 이전 소유 복원 — 현재 상태에서 그날 점령을 되돌림(공개 후 DB = 그날 결과 반영 상태).
  const beforeOwner: Record<number, string | null> = {};
  for (const z of zoneRows) beforeOwner[z.id] = z.owner;
  for (const c of s.captures) {
    const z = byName.get(c.zone);
    if (z) beforeOwner[z.id] = c.from;
  }

  // 길드별 공격 대상(경합 rival 산출)과 관련 길드 수집.
  const names = new Set<string>();
  for (const c of s.captures) {
    names.add(c.winner);
    if (c.from) names.add(c.from);
  }
  for (const d of s.defenses) names.add(d.owner);
  for (const a of s.attacks) names.add(a.guild);

  const events: Record<string, ReplayEvent> = {};
  const originFor = (guild: string, targetZone: string): number | null => {
    const t = byName.get(targetZone);
    if (!t) return null;
    let best: number | null = null;
    let bd = Infinity;
    for (const z of zoneRows) {
      if (beforeOwner[z.id] !== guild || z.name === targetZone) continue;
      const d = (z.map_x - t.map_x) ** 2 + (z.map_y - t.map_y) ** 2;
      if (d < bd) { bd = d; best = z.id; }
    }
    return best; // null = 무영지 → 지도 밖 등장
  };
  const rivalsFor = (zone: string, winner: string) =>
    [...new Set(s.attacks.filter((a) => a.zone === zone && a.guild !== winner).map((a) => a.guild))];

  for (const c of s.captures) {
    const z = byName.get(c.zone);
    if (!z) continue;
    const rivals = rivalsFor(c.zone, c.winner);
    const origins: Record<string, number | null> = { [c.winner]: originFor(c.winner, c.zone) };
    for (const r of rivals) origins[r] = originFor(r, c.zone);
    events[c.zone] = { zoneId: z.id, zone: c.zone, type: 'capture', winner: c.winner, from: c.from, rivals, origins };
  }
  for (const d of s.defenses) {
    const z = byName.get(d.zone);
    if (!z || events[d.zone]) continue;
    const rivals = rivalsFor(d.zone, d.owner);
    if (rivals.length === 0) continue; // 공격 없던 방어(무승부 보정 등)는 연출 생략
    const origins: Record<string, number | null> = {};
    for (const r of rivals) origins[r] = originFor(r, d.zone);
    events[d.zone] = { zoneId: z.id, zone: d.zone, type: 'defense', winner: d.owner, from: null, rivals, origins };
  }
  if (Object.keys(events).length === 0) return null;

  // 길드 문양 메타 — emblem_color/url 비정규화 미러 사용. 해산 길드는 조회 불가 → 회색 폴백.
  const guildRows = names.size
    ? await db
        .select({ name: guilds.name, color: guilds.emblemColor, emblemUrl: guilds.emblemUrl })
        .from(guilds)
        .where(inArray(guilds.name, [...names]))
    : [];
  const guildMeta: Record<string, ReplayGuild> = {};
  for (const n of names) guildMeta[n] = { color: null, emblemUrl: null };
  for (const g of guildRows) guildMeta[g.name] = { color: g.color, emblemUrl: g.emblemUrl };

  return { kstDay, guilds: guildMeta, events, beforeOwner };
}
