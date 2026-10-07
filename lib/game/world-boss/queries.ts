/**
 * 월드보스 읽기 질의 — 세계지도(마커·띠·구역 시트 카드)와 /world-boss 화면이 쓴다. 쓰기는 party.ts·spawn.ts.
 * 서버 전용(DB). 클라에 내려 주는 모양은 map-types.ts.
 */
import 'server-only';

import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds } from '@/lib/db/schema/guild';
import { worldBossParties, worldBossPartyMembers, worldBosses } from '@/lib/db/schema/world-boss';
import { WORLD_BOSS_LEFT_NOTE_MS, worldBossStageFor } from '@/lib/game/guild/balance';

import { worldBossName } from './bosses';
import type { WorldBossMapBoss, WorldBossMapLeft, WorldBossMapState, WorldBossMine } from './map-types';

/**
 * 지도 상태 — 머무는 보스 전부(출현 순) + 떠난 지 48시간 안인 보스(구역당 가장 최근 하나).
 * userId가 있으면 보스마다 내 상태(모집 중 원정대 소속 / 출발 완료)를 함께 준다.
 */
export async function getWorldBossMapState(serverId: number, userId: string | null, now = new Date()): Promise<WorldBossMapState> {
  const rows = await db
    .select({
      id: worldBosses.id,
      zoneId: worldBosses.zoneId,
      region: worldBosses.region,
      spawnAt: worldBosses.spawnAt,
      leaveAt: worldBosses.leaveAt,
      totalDamage: worldBosses.totalDamage,
      stage: worldBosses.stage,
      lootDiamond: worldBosses.lootDiamond,
      lootBoxes: worldBosses.lootBoxes,
    })
    .from(worldBosses)
    .where(and(eq(worldBosses.serverId, serverId), eq(worldBosses.status, 'active')))
    .orderBy(worldBosses.spawnAt);

  const ids = rows.map((r) => r.id);
  const counts = new Map<string, { recruiting: number; departed: number }>();
  const mine = new Map<string, WorldBossMine>();
  if (ids.length > 0) {
    const c = await db
      .select({ bossId: worldBossParties.bossId, status: worldBossParties.status, n: sql<number>`count(*)::int` })
      .from(worldBossParties)
      .where(inArray(worldBossParties.bossId, ids))
      .groupBy(worldBossParties.bossId, worldBossParties.status);
    for (const r of c) {
      const k = r.bossId.toString();
      const cur = counts.get(k) ?? { recruiting: 0, departed: 0 };
      if (r.status === 'recruiting') cur.recruiting += r.n;
      else if (r.status === 'departed') cur.departed += r.n;
      counts.set(k, cur);
    }
    if (userId) {
      // 해산된 원정대의 참가 행은 지워지므로(party.ts) 남은 행은 모집 중이거나 출발한 것뿐이다.
      const m = await db
        .select({ bossId: worldBossPartyMembers.bossId, status: worldBossParties.status })
        .from(worldBossPartyMembers)
        .innerJoin(worldBossParties, eq(worldBossParties.id, worldBossPartyMembers.partyId))
        .where(and(eq(worldBossPartyMembers.userId, userId), inArray(worldBossPartyMembers.bossId, ids)));
      for (const r of m) mine.set(r.bossId.toString(), r.status === 'departed' ? 'fought' : 'recruiting');
    }
  }

  const active: WorldBossMapBoss[] = rows.map((r) => {
    const id = r.id.toString();
    const total = Number(r.totalDamage);
    const st = worldBossStageFor(total);
    const c = counts.get(id) ?? { recruiting: 0, departed: 0 };
    return {
      id,
      zoneId: r.zoneId,
      region: r.region,
      name: worldBossName(r.region),
      spawnAt: r.spawnAt.getTime(),
      leaveAt: r.leaveAt.getTime(),
      totalDamage: r.totalDamage.toString(),
      stage: r.stage,
      into: st.into,
      need: st.need,
      lootDiamond: Number(r.lootDiamond),
      lootBoxes: r.lootBoxes,
      recruiting: c.recruiting,
      departed: c.departed,
      mine: mine.get(id) ?? 'none',
    };
  });

  const since = new Date(now.getTime() - WORLD_BOSS_LEFT_NOTE_MS);
  const leftRows = await db
    .select({
      id: worldBosses.id,
      zoneId: worldBosses.zoneId,
      region: worldBosses.region,
      leaveAt: worldBosses.leaveAt,
      lootDiamond: worldBosses.lootDiamond,
      lootBoxes: worldBosses.lootBoxes,
      settledGuildName: guilds.name,
    })
    .from(worldBosses)
    .leftJoin(guilds, eq(guilds.id, worldBosses.settledGuildId))
    .where(and(eq(worldBosses.serverId, serverId), eq(worldBosses.status, 'left'), gt(worldBosses.leaveAt, since)))
    .orderBy(desc(worldBosses.leaveAt));
  const seen = new Set<number>();
  const left: WorldBossMapLeft[] = [];
  for (const r of leftRows) {
    if (seen.has(r.zoneId)) continue; // 구역당 가장 최근 하나
    seen.add(r.zoneId);
    left.push({
      bossId: r.id.toString(),
      zoneId: r.zoneId,
      region: r.region,
      name: worldBossName(r.region),
      leftAt: r.leaveAt.getTime(),
      settledGuildName: r.settledGuildName ?? null,
      lootDiamond: Number(r.lootDiamond),
      lootBoxes: r.lootBoxes,
    });
  }
  return { active, left };
}
