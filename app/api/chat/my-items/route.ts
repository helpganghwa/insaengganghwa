import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';
import { catalogItems, userEquipment } from '@/lib/db/schema/equipment';
import { pieceCombatPower } from '@/lib/game/balance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 장비 자랑 태그 선택용 내 장비 목록(0127) — 강화 내림차순. */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const serverId = await getActiveServerId();
  const rows = await db
    .select({
      id: userEquipment.id,
      name: catalogItems.name,
      code: catalogItems.code,
      slot: catalogItems.slot,
      e: userEquipment.enhanceLevel,
      t: userEquipment.transcendLevel,
    })
    .from(userEquipment)
    .innerJoin(catalogItems, eq(catalogItems.id, userEquipment.catalogItemId))
    .where(and(eq(userEquipment.userId, userId), eq(userEquipment.serverId, serverId)))
    .orderBy(desc(userEquipment.enhanceLevel), desc(userEquipment.transcendLevel));
  return NextResponse.json({
    items: rows.map((r) => ({
      id: String(r.id),
      name: r.name,
      code: r.code,
      slot: r.slot,
      e: r.e,
      t: r.t,
      cp: pieceCombatPower(r.e, r.t),
    })),
  });
}
