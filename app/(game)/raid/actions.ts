'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { rateLimited } from '@/lib/ratelimit';
import {
  openRaid,
  joinRaid,
  attackRaid,
  buyExtraAttack,
  gemAttackRaid,
  settleRaid,
  claimRaidReward,
  RaidError,
  type RaidBoss,
} from '@/lib/game/raid';
import { RAID_OPEN_COST_DIAMOND } from '@/lib/game/balance';

type Err = { status: 'error'; code: string; message: string };
const MSG: Record<string, string> = {
  INSUFFICIENT_DIAMOND: `다이아가 부족합니다 (소환 ${RAID_OPEN_COST_DIAMOND.toLocaleString('ko-KR')}).`,
  DAILY_CAP_REACHED: '오늘 레이드 한도(5회)를 모두 사용했습니다.',
  CONCURRENT_LIMIT: '동시 진행 레이드는 3개까지입니다.',
  RAID_NOT_FOUND: '레이드를 찾을 수 없습니다.',
  RAID_CLOSED: '종료되었거나 만료된 레이드입니다.',
  RAID_FULL: '인원이 가득 찼습니다 (최대 10명).',
  ALREADY_JOINED: '이미 참여 중입니다.',
  NOT_PARTICIPANT: '참여자가 아닙니다.',
  NO_ATTACKS: '공격 횟수를 모두 사용했습니다 (추가 공격 구매 가능).',
  REWARD_ALREADY_CLAIMED: '이미 보상을 받았습니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
  UNKNOWN: '알 수 없는 오류',
};
const err = (c: string): Err => ({ status: 'error', code: c, message: MSG[c] ?? c });
function rev(raidId?: string) {
  revalidatePath('/raid');
  revalidatePath('/');
  if (raidId) revalidatePath(`/raid/${raidId}`);
}
const uid = () => getSessionUserId();

export async function openRaidAction(bossCode: RaidBoss, visibleToFriends = false) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'raid')) return err('RATE_LIMITED');
  try {
    const r = await openRaid({ userId: u, bossCode, visibleToFriends });
    rev();
    return { status: 'success' as const, raidId: r.raidId.toString(), shareCode: r.shareCode };
  } catch (e) {
    if (e instanceof RaidError) return err(e.code);
    console.error('[raid.open]', e);
    return err('UNKNOWN');
  }
}

export async function joinRaidAction(shareCode: string) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'raid')) return err('RATE_LIMITED');
  try {
    const r = await joinRaid({ userId: u, shareCode });
    rev(r.raidId.toString());
    return { status: 'success' as const, raidId: r.raidId.toString() };
  } catch (e) {
    if (e instanceof RaidError) return err(e.code);
    console.error('[raid.join]', e);
    return err('UNKNOWN');
  }
}

export async function attackRaidAction(raidId: string) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'raid')) return err('RATE_LIMITED');
  try {
    const r = await attackRaid({ userId: u, raidId: BigInt(raidId) });
    rev(raidId);
    return { status: 'success' as const, ...r };
  } catch (e) {
    if (e instanceof RaidError) return err(e.code);
    console.error('[raid.attack]', e);
    return err('UNKNOWN');
  }
}

export async function buyExtraAttackAction(raidId: string) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'raid')) return err('RATE_LIMITED');
  try {
    const r = await buyExtraAttack({ userId: u, raidId: BigInt(raidId) });
    rev(raidId);
    return { status: 'success' as const, ...r };
  } catch (e) {
    if (e instanceof RaidError) return err(e.code);
    console.error('[raid.extra]', e);
    return err('UNKNOWN');
  }
}

/** 보석 공격 — 추가 공격 구매 + 즉시 공격을 한 트랜잭션으로(충전 단계 생략). */
export async function gemAttackRaidAction(raidId: string) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'raid')) return err('RATE_LIMITED');
  try {
    const r = await gemAttackRaid({ userId: u, raidId: BigInt(raidId) });
    rev(raidId);
    return { status: 'success' as const, ...r };
  } catch (e) {
    if (e instanceof RaidError) return err(e.code);
    console.error('[raid.gemAttack]', e);
    return err('UNKNOWN');
  }
}

/** 결산 보상 인페이지 수령 — grow와 동일 흐름. (raid_id,user_id) 단위 멱등. */
export async function claimRaidRewardAction(raidId: string) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'raid')) return err('RATE_LIMITED');
  try {
    const r = await claimRaidReward({ userId: u, raidId: BigInt(raidId) });
    rev(raidId);
    return { status: 'success' as const, result: r };
  } catch (e) {
    if (e instanceof RaidError) return err(e.code);
    console.error('[raid.claim]', e);
    return err('UNKNOWN');
  }
}

/** 만료 레이드 lazy 정산 — 조회 시 호출(멱등). 보상은 raid_rewards 적재(인페이지 수령). */
export async function settleRaidAction(raidId: string) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'raid')) return err('RATE_LIMITED');
  try {
    const r = await settleRaid({ raidId: BigInt(raidId) });
    rev(raidId);
    return { status: 'success' as const, ...r };
  } catch (e) {
    console.error('[raid.settle]', e);
    return err('UNKNOWN');
  }
}
