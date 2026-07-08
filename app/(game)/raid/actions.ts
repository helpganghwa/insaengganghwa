'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { makeErr } from '@/lib/game/action-result';
import { getActiveServerId } from '@/lib/game/servers';
import { rateLimited } from '@/lib/ratelimit';
import { actionBlock } from '@/lib/game/action-gate';
import {
  openRaid,
  joinOrRequestRaid,
  requestJoinRaid,
  decideJoinRequest,
  attackRaid,
  buyExtraAttack,
  gemAttackRaid,
  settleRaid,
  claimRaidReward,
  RaidError,
  type RaidBoss,
  type RaidShareMode,
  type JoinScope,
} from '@/lib/game/raid';
import { RAID_OPEN_COST_DIAMOND } from '@/lib/game/balance';

const MSG: Record<string, string> = {
  INSUFFICIENT_DIAMOND: `다이아가 부족합니다 (소환 ${RAID_OPEN_COST_DIAMOND.toLocaleString('ko-KR')}).`,
  DAILY_CAP_REACHED: '오늘 레이드 한도(5회)를 모두 사용했습니다.',
  CONCURRENT_LIMIT: '동시 진행 레이드는 3개까지입니다.',
  RAID_NOT_FOUND: '레이드를 찾을 수 없습니다.',
  RAID_CLOSED: '종료되었거나 만료된 레이드입니다.',
  NOT_SHARED: '비공개 레이드입니다.',
  RAID_FULL: '인원이 가득 찼습니다 (최대 10명).',
  ALREADY_JOINED: '이미 참여 중입니다.',
  NOT_PARTICIPANT: '참여자가 아닙니다.',
  NOT_HOST: '개설자만 처리할 수 있습니다.',
  REQUEST_NOT_FOUND: '참가 요청을 찾을 수 없습니다.',
  NO_ATTACKS: '공격 횟수를 모두 사용했습니다 (추가 공격 구매 가능).',
  REWARD_ALREADY_CLAIMED: '이미 보상을 받았습니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
  MAINTENANCE: '서버 점검 중입니다. 잠시 후 다시 시도해 주세요.',
  UNKNOWN: '알 수 없는 오류',
};
const err = makeErr(MSG);
function rev(raidId?: string) {
  revalidatePath('/raid');
  revalidatePath('/');
  if (raidId) revalidatePath(`/raid/${raidId}`);
}
const uid = () => getSessionUserId();

export async function openRaidAction(
  bossCode: RaidBoss,
  friendShare: RaidShareMode = 'off',
  guildShare: RaidShareMode = 'off',
) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'raid')) return err('RATE_LIMITED');
  const __b = await actionBlock(); if (__b) return err(__b);
  try {
    const r = await openRaid({ userId: u, serverId: await getActiveServerId(), bossCode, friendShare, guildShare });
    rev();
    return { status: 'success' as const, raidId: r.raidId.toString(), shareCode: r.shareCode };
  } catch (e) {
    if (e instanceof RaidError) return err(e.code);
    console.error('[raid.open]', e);
    return err('UNKNOWN');
  }
}

/** 공유링크 참가 — 즉시 X, 요청 생성(개설자 수락 대기). 호스트/기참가자는 'joined'. */
export async function requestJoinRaidAction(shareCode: string) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'raid')) return err('RATE_LIMITED');
  const __b = await actionBlock(); if (__b) return err(__b);
  try {
    const r = await requestJoinRaid({ userId: u, shareCode });
    rev(r.raidId.toString());
    return { status: 'success' as const, raidId: r.raidId.toString(), state: r.state };
  } catch (e) {
    if (e instanceof RaidError) return err(e.code);
    console.error('[raid.requestJoin]', e);
    return err('UNKNOWN');
  }
}

/** 개설자의 참가요청 수락/거절. */
export async function decideJoinRequestAction(
  raidId: string,
  requesterUserId: string,
  approve: boolean,
) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'raid')) return err('RATE_LIMITED');
  const __b = await actionBlock(); if (__b) return err(__b);
  try {
    const r = await decideJoinRequest({
      hostUserId: u,
      raidId: BigInt(raidId),
      requesterUserId,
      approve,
    });
    rev(raidId);
    return { status: 'success' as const, approved: r.approved };
  } catch (e) {
    if (e instanceof RaidError) {
      // 수락 경로 — 개인 한도 초과는 호스트가 아니라 '요청자' 기준이라 호스트 기준 문구로 오인됨(감사 A4).
      // 요청자 관점 문구로 재매핑(RAID_FULL은 중립이라 공통 문구 유지).
      const decideMsg: Record<string, string> = {
        CONCURRENT_LIMIT: '상대가 동시 진행 한도(3개)를 초과해 수락할 수 없습니다.',
        DAILY_CAP_REACHED: '상대가 오늘 레이드 한도를 모두 사용해 수락할 수 없습니다.',
      };
      const m = decideMsg[e.code];
      return m ? { status: 'error' as const, code: e.code, message: m } : err(e.code);
    }
    console.error('[raid.decideJoin]', e);
    return err('UNKNOWN');
  }
}

/** 친구/길드 목록 참가 — scope의 공개 모드가 free면 즉시, approval이면 요청. */
export async function joinRaidAction(shareCode: string, scope: JoinScope = 'friend') {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'raid')) return err('RATE_LIMITED');
  const __b = await actionBlock(); if (__b) return err(__b);
  try {
    const r = await joinOrRequestRaid({ userId: u, shareCode, scope });
    rev(r.raidId.toString());
    return { status: 'success' as const, raidId: r.raidId.toString(), state: r.state };
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
  const __b = await actionBlock(); if (__b) return err(__b);
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

// 클라 생성 멱등키 검증(0109) — UUID 형식만 통과(임의 문자열로 인한 uuid 캐스트 오류 방지).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asIdemKey = (k?: string) => (k && UUID_RE.test(k) ? k : undefined);

export async function buyExtraAttackAction(raidId: string, idemKey?: string) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'raid')) return err('RATE_LIMITED');
  const __b = await actionBlock(); if (__b) return err(__b);
  try {
    const r = await buyExtraAttack({ userId: u, serverId: await getActiveServerId(), raidId: BigInt(raidId), idemKey: asIdemKey(idemKey) });
    rev(raidId);
    return { status: 'success' as const, ...r };
  } catch (e) {
    if (e instanceof RaidError) return err(e.code);
    console.error('[raid.extra]', e);
    return err('UNKNOWN');
  }
}

/** 보석 공격 — 추가 공격 구매 + 즉시 공격을 한 트랜잭션으로(충전 단계 생략). */
export async function gemAttackRaidAction(raidId: string, idemKey?: string) {
  const u = await uid();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'raid')) return err('RATE_LIMITED');
  const __b = await actionBlock(); if (__b) return err(__b);
  try {
    const r = await gemAttackRaid({ userId: u, serverId: await getActiveServerId(), raidId: BigInt(raidId), idemKey: asIdemKey(idemKey) });
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
  const __b = await actionBlock(); if (__b) return err(__b);
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
  const __b = await actionBlock(); if (__b) return err(__b);
  try {
    const r = await settleRaid({ raidId: BigInt(raidId) });
    rev(raidId);
    return { status: 'success' as const, ...r };
  } catch (e) {
    console.error('[raid.settle]', e);
    return err('UNKNOWN');
  }
}
