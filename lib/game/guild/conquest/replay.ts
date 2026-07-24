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
  /** 수비 병력이 현장에 있었는지 — capture는 finale 로스터의 이전 주인 수비수(>0),
   *  defense는 항상 true. true면 구역에 수비 문양을 세우고 격돌을 재생(무혈과 구분). */
  defended: boolean;
};

export type ConquestReplay = {
  kstDay: string;
  guilds: Record<string, ReplayGuild>;
  /** 구역명 → 이벤트(연대기 마커 트리거용). */
  events: Record<string, ReplayEvent>;
  /** 방치 중립화된 구역 — 리플레이 종료 시 소유 길드 문양이 소멸(전투 아님, 배치 안 해 방치로 상실). */
  neutralized: { zoneId: number; zone: string; guild: string }[];
  /** 리플레이 시작 시점의 소유 상태(구역 id → 길드명 | null) — 종료 상태는 현재 DB와 일치. */
  beforeOwner: Record<number, string | null>;
};

export async function getConquestReplay(serverId: number, forKstDay?: string): Promise<ConquestReplay | null> {
  // 기본: 연대기와 동일한 '최신 공개일'(읽기 게이트 kst_day < 오늘 KST와 정합).
  // forKstDay 지정 시 그 날짜로 — 공개 전 검수(어드민 미리보기, 2026-07-16) 전용.
  let kstDay: string;
  if (forKstDay) {
    kstDay = forKstDay.slice(0, 10);
  } else {
    const [row] = (await db.execute(dsql`
      select kst_day::text d from world_chronicle
      where server_id = ${serverId} and kst_day < (now() at time zone 'Asia/Seoul')::date
      order by kst_day desc limit 1
    `)) as unknown as { d: string }[];
    if (!row) return null;
    kstDay = row.d.slice(0, 10);
  }

  const s = await aggregateConquestDay(kstDay, serverId);
  if (s.captures.length === 0 && s.defenses.length === 0 && s.neutralized.length === 0) return null;

  // 구역 메타 + 그날 종료 시점 소유 — **전투 이력 기반**(zone별 kstDay 이하 최신 승자).
  // 현 DB owner 기준이면 과거 날짜 리플레이(어제 탭)에 이후 날의 결과가 섞이고,
  // 검수 시점(자정 플립 전)의 오늘 리플레이도 어긋난다(2026-07-17). 소유는 전투로만
  // 바뀌므로(해산 중립화는 길드 삭제 → 이름 해석 null=중립으로 자연 수렴) 이력이 단일 진실.
  const zoneRows = (await db.execute(dsql`
    select z.id, z.name, z.map_x, z.map_y,
           (select g2.name from conquest_battles cb2
              join guilds g2 on g2.id = cb2.winner_guild_id
              where cb2.zone_id = z.id and cb2.server_id = z.server_id
                and cb2.battle_kst_day <= ${kstDay}::date
              order by cb2.battle_kst_day desc limit 1) as owner
    from zones z
    where z.server_id = ${serverId}
  `)) as unknown as { id: number; name: string; map_x: number; map_y: number; owner: string | null }[];
  const byName = new Map(zoneRows.map((z) => [z.name, z]));

  // 이전 소유 복원 — 그날 종료 상태에서 그날 점령을 되돌림(위 이력 기반이라 날짜 무관 정확).
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
    events[c.zone] = { zoneId: z.id, zone: c.zone, type: 'capture', winner: c.winner, from: c.from, rivals, origins, defended: c.defenders > 0 };
  }
  for (const d of s.defenses) {
    const z = byName.get(d.zone);
    if (!z || events[d.zone]) continue;
    const rivals = rivalsFor(d.zone, d.owner);
    if (rivals.length === 0) continue; // 공격 없던 방어(무승부 보정 등)는 연출 생략
    const origins: Record<string, number | null> = {};
    for (const r of rivals) origins[r] = originFor(r, d.zone);
    events[d.zone] = { zoneId: z.id, zone: d.zone, type: 'defense', winner: d.owner, from: null, rivals, origins, defended: true };
  }

  // 방치 중립화 — 그날 방치로 중립이 된 구역(전투 아님). 리플레이 시작 시 소유 길드 문양을 세우고
  // (beforeOwner), 종료 연출에서 문양을 소멸시킨다. zone명 → id 매핑 + 소유 길드 수집.
  const neutralized: { zoneId: number; zone: string; guild: string }[] = [];
  for (const n of s.neutralized) {
    for (const zn of n.zones) {
      const z = byName.get(zn);
      if (!z) continue;
      neutralized.push({ zoneId: z.id, zone: zn, guild: n.guildName });
      beforeOwner[z.id] = n.guildName; // 시작 시 소유 길드 문양(→ 종료 시 소멸)
      names.add(n.guildName);
    }
  }

  if (Object.keys(events).length === 0 && neutralized.length === 0) return null;

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

  return { kstDay, guilds: guildMeta, events, neutralized, beforeOwner };
}
