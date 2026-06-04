'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { rateLimited } from '@/lib/ratelimit';
import { claimFree, claimPremium, BattlePassErr } from '@/lib/game/battlepass';
import type { BattlePassType } from '@/lib/game/balance';

/**
 * 배틀패스 액션 — 무료/프리미엄 라인 수령. 프리미엄 구간 구매는 결제 백엔드(포트원)
 * 연동 후 활성(현재 UI '준비 중').
 */
type ErrorState = { status: 'error'; code: string; message: string };
const MSG: Record<string, string> = {
  NOTHING_TO_CLAIM: '받을 보상이 없습니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
  UNKNOWN: '알 수 없는 오류',
};
const err = (c: string): ErrorState => ({ status: 'error', code: c, message: MSG[c] ?? c });

function revalidate() {
  revalidatePath('/battlepass');
  revalidatePath('/');
}

export async function claimFreeAction(type: BattlePassType) {
  const u = await getSessionUserId();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'battlepass')) return err('RATE_LIMITED');
  try {
    const r = await claimFree(u, type);
    revalidate();
    return { status: 'success' as const, granted: r.granted, rewardKind: r.rewardKind };
  } catch (e) {
    if (e instanceof BattlePassErr) return err(e.code);
    console.error('[battlepass.claimFree]', e);
    return err('UNKNOWN');
  }
}

export async function claimPremiumAction(type: BattlePassType) {
  const u = await getSessionUserId();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'battlepass')) return err('RATE_LIMITED');
  try {
    const r = await claimPremium(u, type);
    revalidate();
    return { status: 'success' as const, granted: r.granted, rewardKind: r.rewardKind };
  } catch (e) {
    if (e instanceof BattlePassErr) return err(e.code);
    console.error('[battlepass.claimPremium]', e);
    return err('UNKNOWN');
  }
}

/** 무료 + 프리미엄 한 번에 수령. 각 라인은 받을 게 없으면 건너뜀(둘 다 없으면 에러). */
export async function claimAllAction(type: BattlePassType) {
  const u = await getSessionUserId();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'battlepass')) return err('RATE_LIMITED');
  const rewardKind = type === 'enhance' ? ('diamond' as const) : ('box' as const);
  let granted = 0;
  for (const claim of [claimFree, claimPremium]) {
    try {
      const r = await claim(u, type);
      granted += r.granted;
    } catch (e) {
      if (e instanceof BattlePassErr && e.code === 'NOTHING_TO_CLAIM') continue;
      console.error('[battlepass.claimAll]', e);
      return err('UNKNOWN');
    }
  }
  if (granted <= 0) return err('NOTHING_TO_CLAIM');
  revalidate();
  return { status: 'success' as const, granted, rewardKind };
}
