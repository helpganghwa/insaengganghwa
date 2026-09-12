'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { rateLimited } from '@/lib/ratelimit';
import { getActiveServerId } from '@/lib/game/servers';
import { actionBlock } from '@/lib/game/action-gate';
import {
  cancelExpedition,
  claimExpedition,
  ensureOffers,
  ExpeditionError,
  refreshAllOffers,
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
type Fail = { ok: false; code: ExpeditionErrorCode | 'AUTH' | 'BANNED' | 'MAINTENANCE' | 'UNKNOWN' };
export type BoardResult = { ok: true; board: ExpeditionBoard } | Fail;
export type ClaimActionResult = ({ ok: true; board: ExpeditionBoard } & ClaimResult) | Fail;

type Ctx = { userId: string; serverId: number };

/**
 * 전 액션 공용 진입 — 세션·연타·정지/점검을 한 곳에서 막는다.
 *
 * 차단 사유를 **그대로 돌려준다**. null로 뭉개면 정지된 계정에게 "잠시 후 다시 시도해주세요"가
 * 떠서 영원히 다시 누르게 된다(2026-09-12 검수).
 */
async function ctx(): Promise<Ctx | Fail> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, code: 'AUTH' };
  // 정상 플레이는 통과, 연타 봇만 차단(EXPEDITION §6 — 적대 검수 3).
  if (await rateLimited(userId, 'expedition')) return { ok: false, code: 'UNKNOWN' };
  // 정지·점검 게이트 — 레이아웃은 화면만 막고 서버 액션은 레이아웃을 거치지 않는다. 이게 없으면
  // 정지된 계정이 화면 없이 파견 수령(💎·상자 지급)과 유료 새로고침(💎 차감)을 계속 돌릴 수 있고,
  // 점검 중에도 경제가 변한다. 다른 재화 도메인은 전부 걸려 있는데 파견만 빠져 있었다(2026-09-12 검수).
  const blocked = await actionBlock();
  if (blocked) return { ok: false, code: blocked };
  return { userId, serverId: await getActiveServerId() };
}

/** ctx() 결과가 실패인가. */
function blocked(c: Ctx | Fail): c is Fail {
  return 'ok' in c;
}

function failOf(e: unknown): Fail {
  if (e instanceof ExpeditionError) return { ok: false, code: e.code };
  console.error('[expedition-action]', e);
  return { ok: false, code: 'UNKNOWN' };
}

/** 진입/재동기 — 오퍼 보정 후 보드. */
export async function expeditionBoardAction(): Promise<BoardResult> {
  const c = await ctx();
  if (blocked(c)) return c;
  try {
    await ensureOffers(c.userId, c.serverId);
    return { ok: true, board: await getExpeditionBoard(c.userId, c.serverId) };
  } catch (e) {
    return failOf(e);
  }
}

export async function refreshOfferAction(slot: number): Promise<BoardResult> {
  const c = await ctx();
  if (blocked(c)) return c;
  try {
    await refreshOffer(c.userId, c.serverId, slot);
    return { ok: true, board: await getExpeditionBoard(c.userId, c.serverId) };
  } catch (e) {
    return failOf(e);
  }
}

export async function refreshAllOffersAction(): Promise<BoardResult> {
  const c = await ctx();
  if (blocked(c)) return c;
  try {
    await refreshAllOffers(c.userId, c.serverId);
    return { ok: true, board: await getExpeditionBoard(c.userId, c.serverId) };
  } catch (e) {
    return failOf(e);
  }
}

export async function startExpeditionAction(slot: number, avatarProfileId: string): Promise<BoardResult> {
  const c = await ctx();
  if (blocked(c)) return c;
  try {
    await startExpedition(c.userId, c.serverId, slot, avatarProfileId);
    revalidatePath('/'); // 홈 파견 카드 문구(완료/진행/대기) — 뒤로가기 라우터 캐시 갱신
    return { ok: true, board: await getExpeditionBoard(c.userId, c.serverId) };
  } catch (e) {
    return failOf(e);
  }
}

/** 취소 — 빈 슬롯을 즉시 새 오퍼로 보정해서 돌려준다(슬롯이 비어 보이는 프레임 방지). */
export async function cancelExpeditionAction(slot: number): Promise<BoardResult> {
  const c = await ctx();
  if (blocked(c)) return c;
  try {
    await cancelExpedition(c.userId, c.serverId, slot);
    await ensureOffers(c.userId, c.serverId);
    revalidatePath('/'); // 홈 파견 카드 문구(완료/진행/대기) — 뒤로가기 라우터 캐시 갱신
    return { ok: true, board: await getExpeditionBoard(c.userId, c.serverId) };
  } catch (e) {
    return failOf(e);
  }
}

/** 수령 — 지급 후 빈 슬롯을 새 오퍼로 채워서 반환(수령→다음 미션의 즉시 루프). */
export async function claimExpeditionAction(slot: number): Promise<ClaimActionResult> {
  const c = await ctx();
  if (blocked(c)) return c;
  try {
    const r = await claimExpedition(c.userId, c.serverId, slot);
    await ensureOffers(c.userId, c.serverId);
    revalidatePath('/'); // 홈 파견 카드 문구(완료/진행/대기) — 뒤로가기 라우터 캐시 갱신
    return { ok: true, ...r, board: await getExpeditionBoard(c.userId, c.serverId) };
  } catch (e) {
    return failOf(e);
  }
}
