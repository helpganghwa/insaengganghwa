'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { actionBlock } from '@/lib/game/action-gate';
import { makeErr } from '@/lib/game/action-result';
import { equipItems, EquipError } from '@/lib/game/equipment/equip';
import { refreshTowerMetric } from '@/lib/game/leaderboard/incremental';
import { getActiveServerId } from '@/lib/game/servers';
import { challengeTower, claimTowerRewards, TowerError, type TowerChallengeResult } from '@/lib/game/tower/service';
import { rateLimited } from '@/lib/ratelimit';

const MSG: Record<string, string> = {
  NOT_NEXT_FLOOR: '지금 도전할 수 있는 층이 아니에요. 화면을 새로 고쳐 주세요.',
  NO_ATTEMPTS: '오늘 도전을 모두 썼어요. 내일 다시 도전할 수 있어요.',
  TOP_REACHED: '지금 열린 가장 높은 층까지 올랐어요.',
  NO_CHARACTER: '이 서버에 캐릭터가 없어요.',
  BAD_AVATAR: '고른 아바타를 찾을 수 없어요.',
  POOL_CHANGED: '이번 주 요구 장비가 바뀌었어요. 화면을 새로 불러왔으니 장비를 확인하고 다시 도전해 주세요.',
  POOL_MISSING: '이번 주 요구 장비를 준비하는 중이에요. 잠시 후 다시 도전해 주세요.',
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

export async function towerChallengeAction(floor: number, profileId: string | null, idemKey: string, week: string) {
  const u = await getSessionUserId();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'tower')) return err('RATE_LIMITED');
  const b = await actionBlock();
  if (b) return err(b);
  try {
    // 입력 형식 검사(감사 L3) — 잘못된 값이 트랜잭션 안(잠금 뒤)에서 uuid 캐스트 오류를 내지 않게.
    if (!Number.isInteger(floor) || floor < 1) return err('NOT_NEXT_FLOOR');
    if (profileId != null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileId)) return err('BAD_AVATAR');
    const serverId = await getActiveServerId();
    const r: TowerChallengeResult = await challengeTower(u, serverId, floor, profileId, { idemKey, week });
    // 랭킹 반영(커밋 뒤, 실패해도 도전은 유효 — 매시 스냅샷이 다시 맞춘다).
    if (r.win) await refreshTowerMetric(u, serverId);
    // 화면을 다시 그리지 않는다(CLAUDE §11.7) — 최고 층·남은 도전·순위는 응답(result)으로 화면이 바로 반영하고,
    // 레이아웃(헤더 다이아·전투력)은 도전으로 바뀌지 않는다. 다른 화면에 갔다 오면 새로 불러온다.
    return { status: 'success' as const, result: r };
  } catch (e) {
    if (e instanceof TowerError) {
      if (e.code === 'POOL_CHANGED') revalidatePath('/tower');
      return err(e.code);
    }
    console.error('[tower.challenge]', e);
    return err('UNKNOWN');
  }
}

/** 탑 화면에서 바로 장착 — 게임 전체 장착과 같다(TOWER.md §2). 여러 개(자동 장착)도 한 번의 요청·한 트랜잭션으로. */
export async function towerEquipAction(userEquipmentIds: string[]) {
  const u = await getSessionUserId();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'tower')) return err('RATE_LIMITED');
  const b = await actionBlock();
  if (b) return err(b);
  try {
    const ids = [...new Set(userEquipmentIds)].slice(0, 3);
    if (!ids.length || !ids.every((id) => /^\d+$/.test(id))) return err('NOT_FOUND');
    await equipItems(u, ids.map((id) => BigInt(id)));
    // 헤더 전투력(레이아웃)이 장착으로 바뀌므로 여기는 다시 그린다 — 자동 장착도 1번.
    revalidatePath('/tower');
    return { status: 'success' as const };
  } catch (e) {
    if (e instanceof EquipError) return err(e.code);
    console.error('[tower.equip]', e);
    return err('UNKNOWN');
  }
}

/** 돌파 보상 받기 — floor를 주면 그 층만, 없으면 받을 수 있는 층 전부. 이미 받은 층은 건너뛴다(서버 멱등). */
export async function towerClaimAction(floor: number | null) {
  const u = await getSessionUserId();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'tower')) return err('RATE_LIMITED');
  const b = await actionBlock();
  if (b) return err(b);
  try {
    const serverId = await getActiveServerId();
    const r = await claimTowerRewards(u, serverId, floor == null ? null : [Math.floor(Number(floor))]);
    // 다시 그리지 않는다 — 받은 층은 화면이 이미 지웠고, 헤더 다이아는 응답의 잔액(diamondBalance)으로 맞춘다.
    return { status: 'success' as const, ...r };
  } catch (e) {
    console.error('[tower.claim]', e);
    return err('UNKNOWN');
  }
}
