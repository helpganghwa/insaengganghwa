'use server';

import { getSessionUserId } from '@/lib/auth/session';
import { rateLimited } from '@/lib/ratelimit';
import { getActiveServerId } from '@/lib/game/servers';
import {
  cancelExpedition,
  claimExpedition,
  ensureOffers,
  ExpeditionError,
  refreshOffer,
  startExpedition,
  type ClaimResult,
  type ExpeditionErrorCode,
} from '@/lib/game/expedition/service';
import { getExpeditionBoard, type ExpeditionBoard } from '@/lib/game/expedition/queries';

/**
 * 파견 서버 액션 — 모든 변이가 **최신 보드를 동봉**해 낙관적 UI가 서버 정본으로 수렴한다
 * (§11.7: router.refresh 금지 — 응답에 다음 상태를 실어 즉시 반영하는 강화 nextJob 패턴).
 */
type Fail = { ok: false; code: ExpeditionErrorCode | 'AUTH' | 'UNKNOWN' };
export type BoardResult = { ok: true; board: ExpeditionBoard } | Fail;
export type ClaimActionResult = ({ ok: true; board: ExpeditionBoard } & ClaimResult) | Fail;

async function ctx(): Promise<{ userId: string; serverId: number } | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  // 전 액션 공용 창(EXPEDITION §6 — 적대 검수 3) — 정상 플레이는 통과, 연타 봇만 차단.
  if (await rateLimited(userId, 'expedition')) return null;
  return { userId, serverId: await getActiveServerId() };
}

function failOf(e: unknown): Fail {
  if (e instanceof ExpeditionError) return { ok: false, code: e.code };
  console.error('[expedition-action]', e);
  return { ok: false, code: 'UNKNOWN' };
}

/** 진입/재동기 — 오퍼 보정 후 보드. */
export async function expeditionBoardAction(): Promise<BoardResult> {
  const c = await ctx();
  if (!c) return { ok: false, code: 'AUTH' };
  try {
    await ensureOffers(c.userId, c.serverId);
    return { ok: true, board: await getExpeditionBoard(c.userId, c.serverId) };
  } catch (e) {
    return failOf(e);
  }
}

export async function refreshOfferAction(slot: number): Promise<BoardResult> {
  const c = await ctx();
  if (!c) return { ok: false, code: 'AUTH' };
  try {
    await refreshOffer(c.userId, c.serverId, slot);
    return { ok: true, board: await getExpeditionBoard(c.userId, c.serverId) };
  } catch (e) {
    return failOf(e);
  }
}

export async function startExpeditionAction(slot: number, avatarProfileId: string): Promise<BoardResult> {
  const c = await ctx();
  if (!c) return { ok: false, code: 'AUTH' };
  try {
    await startExpedition(c.userId, c.serverId, slot, avatarProfileId);
    return { ok: true, board: await getExpeditionBoard(c.userId, c.serverId) };
  } catch (e) {
    return failOf(e);
  }
}

/** 취소 — 빈 슬롯을 즉시 새 오퍼로 보정해서 돌려준다(슬롯이 비어 보이는 프레임 방지). */
export async function cancelExpeditionAction(slot: number): Promise<BoardResult> {
  const c = await ctx();
  if (!c) return { ok: false, code: 'AUTH' };
  try {
    await cancelExpedition(c.userId, c.serverId, slot);
    await ensureOffers(c.userId, c.serverId);
    return { ok: true, board: await getExpeditionBoard(c.userId, c.serverId) };
  } catch (e) {
    return failOf(e);
  }
}

/** 수령 — 지급 후 빈 슬롯을 새 오퍼로 채워서 반환(수령→다음 미션의 즉시 루프). */
export async function claimExpeditionAction(slot: number): Promise<ClaimActionResult> {
  const c = await ctx();
  if (!c) return { ok: false, code: 'AUTH' };
  try {
    const r = await claimExpedition(c.userId, c.serverId, slot);
    await ensureOffers(c.userId, c.serverId);
    return { ok: true, ...r, board: await getExpeditionBoard(c.userId, c.serverId) };
  } catch (e) {
    return failOf(e);
  }
}
