'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { actionBlock } from '@/lib/game/action-gate';
import { makeErr } from '@/lib/game/action-result';
import { equipItem, EquipError } from '@/lib/game/equipment/equip';
import { getActiveServerId } from '@/lib/game/servers';
import { challengeTower, TowerError, type TowerChallengeResult } from '@/lib/game/tower/service';
import { rateLimited } from '@/lib/ratelimit';

const MSG: Record<string, string> = {
  NOT_NEXT_FLOOR: '지금 도전할 수 있는 층이 아니에요. 화면을 새로 고쳐 주세요.',
  NO_ATTEMPTS: '오늘 도전을 모두 썼어요. 내일 다시 도전할 수 있어요.',
  TOP_REACHED: '지금 열린 가장 높은 층까지 올랐어요.',
  NO_CHARACTER: '이 서버에 캐릭터가 없어요.',
  BAD_AVATAR: '고른 아바타를 찾을 수 없어요.',
  NO_POWER: '이 층의 요구 장비를 하나도 장착하지 않았어요. 요구 장비를 먼저 장착해 주세요.',
  NOT_FOUND: '장비를 찾을 수 없습니다.',
  SLOT_TAKEN: '같은 부위를 방금 다른 곳에서 장착했어요. 다시 시도해 주세요.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
  MAINTENANCE: '점검 중입니다. 잠시 후 다시 시도해 주세요.',
  BANNED: '이용이 제한된 계정입니다.',
  UNKNOWN: '지금은 처리할 수 없어요. 잠시 후 다시 시도해 주세요.',
};
const err = makeErr(MSG);

export async function towerChallengeAction(floor: number, profileId: string | null) {
  const u = await getSessionUserId();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'tower')) return err('RATE_LIMITED');
  const b = await actionBlock();
  if (b) return err(b);
  try {
    const serverId = await getActiveServerId();
    const r: TowerChallengeResult = await challengeTower(u, serverId, Math.floor(Number(floor)), profileId);
    revalidatePath('/tower');
    return { status: 'success' as const, result: r };
  } catch (e) {
    if (e instanceof TowerError) return err(e.code);
    console.error('[tower.challenge]', e);
    return err('UNKNOWN');
  }
}

/** 탑 화면에서 바로 장착 — 게임 전체 장착과 같다(TOWER.md §2). */
export async function towerEquipAction(userEquipmentId: string) {
  const u = await getSessionUserId();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'tower')) return err('RATE_LIMITED');
  const b = await actionBlock();
  if (b) return err(b);
  try {
    await equipItem(u, BigInt(userEquipmentId));
    revalidatePath('/tower');
    return { status: 'success' as const };
  } catch (e) {
    if (e instanceof EquipError) return err(e.code);
    console.error('[tower.equip]', e);
    return err('UNKNOWN');
  }
}
