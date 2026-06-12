import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { zones } from '@/lib/db/schema/guild';

import { GuildError } from './errors';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 거주 구역 조회(미배정이면 null). */
export async function getResidence(userId: string, serverId: number): Promise<number | null> {
  const [p] = await db
    .select({ zoneId: characters.residenceZoneId })
    .from(characters)
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
    .limit(1);
  return p?.zoneId ?? null;
}

/** 거주 구역 변경 — GUILD §5.5. 이동 자유(쿨다운 없음). 존재하는 구역만. */
export async function setResidence(userId: string, serverId: number, zoneId: number): Promise<void> {
  const [z] = await db
    .select({ id: zones.id, locked: zones.locked })
    .from(zones)
    .where(and(eq(zones.id, zoneId), eq(zones.serverId, serverId)))
    .limit(1);
  if (!z) throw new GuildError('ZONE_NOT_FOUND');
  if (z.locked) throw new GuildError('ZONE_LOCKED');
  await db
    .update(characters)
    .set({ residenceZoneId: zoneId })
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)));
}

/**
 * 거주 미배정이면 랜덤 배정(최초 랜덤). 트랜잭션 내 호출. 반환 = 거주 zoneId(구역 0개면 null).
 * profiles 행을 for update로 잠가 동시 배정 레이스 방지.
 */
export async function ensureResidence(tx: Tx, userId: string, serverId: number): Promise<number | null> {
  const [p] = await tx
    .select({ zoneId: characters.residenceZoneId })
    .from(characters)
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
    .for('update');
  if (p?.zoneId) return p.zoneId;
  const [z] = await tx
    .select({ id: zones.id })
    .from(zones)
    .where(and(eq(zones.serverId, serverId), eq(zones.locked, false)))
    .orderBy(sql`random()`)
    .limit(1);
  if (!z) return null;
  await tx
    .update(characters)
    .set({ residenceZoneId: z.id })
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)));
  return z.id;
}
