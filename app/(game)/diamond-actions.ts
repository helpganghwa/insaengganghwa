'use server';

import { sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';

/**
 * 잔액 단건 조회(2026-08-22) — 앱/탭 복귀 시 헤더 다이아 동기화 전용 초경량 액션.
 * 헤더 다이아는 layout 재렌더(액션 응답·내비게이션)와 낙관 조정으로만 갱신돼, 웹훅 지급이나
 * 다른 기기 소비가 열려 있는 컨텍스트(PC웹·PWA)에 반영되지 않고 어긋난 채 유지됐다(제보).
 */
export async function getDiamondBalanceAction(): Promise<string | null> {
  const u = await getSessionUserId();
  if (!u) return null;
  const s = await getActiveServerId();
  const rows = (await db.execute(sql`
    select diamond::text as d from characters where user_id = ${u}::uuid and server_id = ${s}
  `)) as unknown as { d: string }[];
  return rows[0]?.d ?? null;
}
