import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { zones } from '@/lib/db/schema/guild';

import { GuildError } from './errors';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 거주 구역 조회(미배정이면 null). */
export async function getResidence(userId: string): Promise<number | null> {
  const [p] = await db
    .select({ zoneId: profiles.residenceZoneId })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return p?.zoneId ?? null;
}

/** 거주 구역 변경 — GUILD §5.5. 이동 자유(쿨다운 없음). 존재하는 구역만. */
export async function setResidence(userId: string, zoneId: number): Promise<void> {
  const [z] = await db.select({ id: zones.id }).from(zones).where(eq(zones.id, zoneId)).limit(1);
  if (!z) throw new GuildError('ZONE_NOT_FOUND');
  await db.update(profiles).set({ residenceZoneId: zoneId }).where(eq(profiles.id, userId));
}

/**
 * 거주 미배정이면 랜덤 배정(최초 랜덤). 트랜잭션 내 호출. 반환 = 거주 zoneId(구역 0개면 null).
 * profiles 행을 for update로 잠가 동시 배정 레이스 방지.
 */
export async function ensureResidence(tx: Tx, userId: string): Promise<number | null> {
  const [p] = await tx
    .select({ zoneId: profiles.residenceZoneId })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .for('update');
  if (p?.zoneId) return p.zoneId;
  const [z] = await tx.select({ id: zones.id }).from(zones).orderBy(sql`random()`).limit(1);
  if (!z) return null;
  await tx.update(profiles).set({ residenceZoneId: z.id }).where(eq(profiles.id, userId));
  return z.id;
}
