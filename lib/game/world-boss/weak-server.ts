import 'server-only';

import { sql } from 'drizzle-orm';

import type { db } from '@/lib/db/client';
import type { WorldBossWeakPhase } from '@/lib/db/schema/world-boss';

import { drawWorldBossWeak, parseWeak, type CatalogBySlot } from './weak';

type Dbx = Pick<typeof db, 'execute'>;

/** 서버 난수 [0,1) — 약점 추첨은 서버에서만(CLAUDE §3.1). */
export function cryptoRand(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296;
}

/** 활성 카탈로그를 부위별 코드 목록으로. */
export async function loadCatalogBySlot(dbx: Dbx): Promise<CatalogBySlot> {
  const rows = (await dbx.execute(sql`select code, slot::text as slot from catalog_items where active order by id`)) as unknown as { code: string; slot: string }[];
  const out: CatalogBySlot = { weapon: [], armor: [], accessory: [] };
  for (const r of rows) if (r.slot === 'weapon' || r.slot === 'armor' || r.slot === 'accessory') (out[r.slot] as string[]).push(r.code);
  return out;
}

/** 새 보스용 약점 추첨. */
export async function drawWeakForNewBoss(dbx: Dbx): Promise<WorldBossWeakPhase[]> {
  return drawWorldBossWeak(await loadCatalogBySlot(dbx), cryptoRand);
}

/**
 * 보스 행의 약점 — 비어 있으면(소환 때 못 채운 옛 행) 지금 뽑아 저장한다. 호출부가 보스 행을 잠근 트랜잭션 안에서 부른다.
 */
export async function ensureBossWeak(tx: Dbx, bossId: string, current: unknown): Promise<WorldBossWeakPhase[]> {
  const weak = parseWeak(current);
  if (weak.length > 0) return weak;
  const drawn = await drawWeakForNewBoss(tx);
  await tx.execute(sql`update world_bosses set weak = ${JSON.stringify(drawn)}::jsonb where id = ${bossId}::bigint`);
  return drawn;
}
