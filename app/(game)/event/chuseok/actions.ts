'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { actionBlock } from '@/lib/game/action-gate';
import { makeErr, type ActionResult } from '@/lib/game/action-result';
import { SONGPYEON_EXCHANGE, type SongpyeonExchangeKind } from '@/lib/game/chuseok/config';
import { claimSongpyeonStep, exchangeSongpyeon } from '@/lib/game/chuseok/songpyeon';
import { getActiveServerId } from '@/lib/game/servers';
import { rateLimited } from '@/lib/ratelimit';

const MSG: Record<string, string> = {
  AUTH: '로그인이 필요해요.',
  BLOCKED: '지금은 받을 수 없어요.',
  RATE: '잠시 후 다시 시도해 주세요.',
  CLOSED: '받을 수 있는 기간이 끝났어요.',
  UNKNOWN_STEP: '없는 단계예요.',
  NOT_REACHED: '아직 도달하지 않은 단계예요.',
  ALREADY: '이미 받은 보상이에요.',
  BAD_COUNT: '개수를 다시 확인해 주세요.',
  INSUFFICIENT: '사용 가능한 송편이 모자라요.',
};
const err = makeErr(MSG);

/** 도달 보상 수령 — 서버 권위 재검증 + 멱등(PK). */
export async function claimSongpyeonStepAction(
  step: number,
): Promise<ActionResult<{ step: number; diamond: number; boxes: number }>> {
  const userId = await getSessionUserId();
  if (!userId) return err('AUTH');
  if (await actionBlock()) return err('BLOCKED');
  if (await rateLimited(userId, 'chuseok')) return err('RATE');
  const serverId = await getActiveServerId();
  const r = await claimSongpyeonStep(userId, serverId, Math.floor(Number(step)));
  if (!r.ok) return err(r.reason);
  revalidatePath('/event/chuseok');
  revalidatePath('/');
  return { status: 'success', step: r.step, diamond: r.diamond, boxes: r.boxes };
}

/** 교환 — 사용 가능 송편 재검증은 서버에서. */
export async function exchangeSongpyeonAction(
  kind: SongpyeonExchangeKind,
  count: number,
): Promise<ActionResult<{ cost: number; diamond: number; boxes: number; available: number }>> {
  const userId = await getSessionUserId();
  if (!userId) return err('AUTH');
  if (await actionBlock()) return err('BLOCKED');
  if (await rateLimited(userId, 'chuseok')) return err('RATE');
  if (!(kind in SONGPYEON_EXCHANGE)) return err('BAD_COUNT');
  const serverId = await getActiveServerId();
  const r = await exchangeSongpyeon(userId, serverId, kind, Math.floor(Number(count)));
  if (!r.ok) return err(r.reason);
  revalidatePath('/event/chuseok');
  revalidatePath('/');
  return { status: 'success', cost: r.cost, diamond: r.diamond, boxes: r.boxes, available: r.available };
}
