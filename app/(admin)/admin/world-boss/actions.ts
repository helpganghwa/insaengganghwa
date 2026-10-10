'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

import { requireAdmin } from '@/lib/auth/require-admin';
import { openServerIds } from '@/lib/game/server-list';
import { cancelScheduledWorldBoss, spawnWorldBossByAdmin, type SpawnResult } from '@/lib/game/world-boss/admin';
import { kstLocalInputToIso } from '@/lib/kst';

export type SpawnActionResult = SpawnResult | { ok: false; code: 'BAD_SERVER' | 'BAD_TIME' };

/**
 * 월드보스 소환 — 어드민. mode 'now' = 즉시, 'at' = atLocal(datetime-local, KST 'YYYY-MM-DDThh:mm')에 예약.
 * allowOverlap = 화면에서 "동시에 2마리" 확인을 거친 뒤 true로 다시 부른다(처음엔 false → OVERLAP이면 묻는다).
 */
export async function spawnWorldBossAction(input: { serverId: number; zoneId: number; mode: 'now' | 'at'; atLocal: string; allowOverlap: boolean }): Promise<SpawnActionResult> {
  const adminId = await requireAdmin();
  const serverId = Math.trunc(Number(input.serverId));
  if (!(await openServerIds()).includes(serverId)) return { ok: false, code: 'BAD_SERVER' };
  let at: Date | null = null;
  if (input.mode === 'at') {
    const iso = kstLocalInputToIso(String(input.atLocal ?? ''));
    if (!iso) return { ok: false, code: 'BAD_TIME' };
    at = new Date(iso);
  }
  const r = await spawnWorldBossByAdmin({ serverId, zoneId: Math.trunc(Number(input.zoneId)), spawnAt: at, adminUserId: adminId, allowOverlap: input.allowOverlap === true });
  if (r.ok) {
    revalidatePath('/admin/world-boss');
    // 즉시 출현은 세계 피드·지도 캐시에 바로 보이게(크론의 출현 처리와 같은 무효화).
    if (r.status === 'active') revalidateTag(`world-feed:s${serverId}`, 'max');
  }
  return r;
}

/** 예약 취소 — '예정'인 보스만 지운다. */
export async function cancelWorldBossAction(input: { serverId: number; bossId: string }): Promise<{ ok: boolean }> {
  const adminId = await requireAdmin();
  const serverId = Math.trunc(Number(input.serverId));
  if (!(await openServerIds()).includes(serverId) || !/^\d+$/.test(String(input.bossId))) return { ok: false };
  const ok = await cancelScheduledWorldBoss({ serverId, bossId: String(input.bossId), adminUserId: adminId });
  if (ok) revalidatePath('/admin/world-boss');
  return { ok };
}
