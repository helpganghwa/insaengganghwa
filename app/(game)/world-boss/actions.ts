'use server';

/**
 * 월드보스 원정대 서버 액션(docs/WORLD-BOSS.md §2) — 만들기·신청·신청 취소·수락/거절·나가기·출발.
 * 판정은 전부 lib/game/world-boss/party.ts(트랜잭션). 여기서는 인증·레이트리밋·점검 게이트·문구만.
 */
import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { makeErr } from '@/lib/game/action-result';
import { actionBlock } from '@/lib/game/action-gate';
import { getActiveServerId } from '@/lib/game/servers';
import { rateLimited } from '@/lib/ratelimit';
import { WorldBossError } from '@/lib/game/world-boss/errors';
import { cancelJoinRequest, createParty, decideJoin, departParty, leaveParty, requestJoin } from '@/lib/game/world-boss/party';
import { getWorldBossBattle } from '@/lib/game/world-boss/queries';
import { bestLoadoutOf, currentPhase, knownWeakOf } from '@/lib/game/world-boss/loadout';
import { EquipError, equipItems } from '@/lib/game/equipment/equip';
import { db } from '@/lib/db/client';
import { sql } from 'drizzle-orm';

const MSG: Record<string, string> = {
  NOT_FOUND: '원정대를 찾을 수 없어요.',
  BOSS_NOT_ACTIVE: '원정이 이미 종료됐어요.',
  NOT_OWNER_GUILD: '원정대는 이 구역을 가진 길드원만 만들 수 있어요.',
  NO_CHARACTER: '이 서버에 캐릭터가 없어요.',
  ALREADY_IN_PARTY: '이미 이 보스의 원정대에 들어가 있어요.',
  ALREADY_FOUGHT: '이 보스와는 이미 싸웠어요. 보스 하나에 1번만 참가할 수 있어요.',
  ALREADY_REQUESTED: '이미 이 보스의 원정대에 신청해 두었어요.',
  NO_REQUEST: '신청이 이미 처리됐어요.',
  PARTY_NOT_RECRUITING: '이미 출발했거나 해산된 원정대예요.',
  PARTY_FULL: '원정대가 가득 찼어요(최대 10명).',
  NOT_LEADER: '원정대장만 할 수 있어요.',
  NOT_MEMBER: '원정대원이 아니에요.',
  LOCKED: '23시부터 다음 날 1시까지는 출발할 수 없어요.',
  UNAUTHENTICATED: '로그인이 필요해요.',
  RATE_LIMITED: '요청이 너무 빨라요. 잠시 후 다시 시도해 주세요.',
  MAINTENANCE: '서버 점검 중이에요. 잠시 후 다시 시도해 주세요.',
  BANNED: '이용이 제한된 계정이에요.',
  ALREADY_EQUIPPED: '이미 가장 좋은 조합으로 장착하고 있어요.',
};
const err = makeErr(MSG);

async function gate(): Promise<{ u: string; sid: number } | ReturnType<typeof err>> {
  const u = await getSessionUserId();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'raid')) return err('RATE_LIMITED');
  const b = await actionBlock();
  if (b) return err(b);
  return { u, sid: await getActiveServerId() };
}
function rev(bossId: string) {
  revalidatePath(`/world-boss/${bossId}`);
  revalidatePath('/guild/map');
}
function fail(e: unknown, where: string) {
  if (e instanceof WorldBossError) return err(e.code);
  console.error(`[world-boss.${where}]`, e);
  return err('UNKNOWN');
}

export async function createPartyAction(bossId: string) {
  const g = await gate();
  if ('status' in g) return g;
  try {
    const r = await createParty({ userId: g.u, serverId: g.sid, bossId });
    rev(bossId);
    return { status: 'success' as const, partyId: r.partyId };
  } catch (e) {
    return fail(e, 'create');
  }
}

export async function requestJoinAction(bossId: string, partyId: string) {
  const g = await gate();
  if ('status' in g) return g;
  try {
    await requestJoin({ userId: g.u, serverId: g.sid, partyId });
    rev(bossId);
    return { status: 'success' as const };
  } catch (e) {
    return fail(e, 'request');
  }
}

export async function cancelRequestAction(bossId: string, partyId: string) {
  const g = await gate();
  if ('status' in g) return g;
  try {
    await cancelJoinRequest({ userId: g.u, partyId });
    rev(bossId);
    return { status: 'success' as const };
  } catch (e) {
    return fail(e, 'cancel');
  }
}

export async function decideJoinAction(bossId: string, partyId: string, userId: string, accept: boolean) {
  const g = await gate();
  if ('status' in g) return g;
  try {
    await decideJoin({ leaderUserId: g.u, serverId: g.sid, partyId, userId, accept });
    rev(bossId);
    return { status: 'success' as const };
  } catch (e) {
    return fail(e, 'decide');
  }
}

export async function leavePartyAction(bossId: string, partyId: string) {
  const g = await gate();
  if ('status' in g) return g;
  try {
    const r = await leaveParty({ userId: g.u, serverId: g.sid, partyId });
    rev(bossId);
    return { status: 'success' as const, disbanded: r.disbanded };
  } catch (e) {
    return fail(e, 'leave');
  }
}

/** 출발 — departKey는 클라가 출발 버튼을 처음 누를 때 만든 uuid(재전송 = 같은 결과). */
export async function departPartyAction(bossId: string, partyId: string, departKey: string) {
  const g = await gate();
  if ('status' in g) return g;
  try {
    const r = await departParty({ leaderUserId: g.u, serverId: g.sid, partyId, departKey });
    rev(bossId);
    return { status: 'success' as const, result: r };
  } catch (e) {
    return fail(e, 'depart');
  }
}

/** 출발 카드 '전투 보기' — 저장된 전투 기록(누구나 볼 수 있다, 같은 서버). */
export async function getBattleAction(partyId: string) {
  const u = await getSessionUserId();
  if (!u) return err('UNAUTHENTICATED');
  try {
    const b = await getWorldBossBattle(partyId, await getActiveServerId());
    if (!b) return err('NOT_FOUND');
    return { status: 'success' as const, battle: b };
  } catch (e) {
    return fail(e, 'battle');
  }
}

/**
 * 약점에 맞춰 장착 — 공개된 약점과 아바타 보너스까지 계산한 부위별 가장 좋은 장비로 한 번에(docs/WORLD-BOSS.md §3).
 * 장착은 게임 전체에 적용된다(탑과 같은 장착). 판정은 서버가 다시 계산하므로 클라가 보낸 값은 없다.
 */
export async function equipBestAction(bossId: string) {
  const g = await gate();
  if ('status' in g) return g;
  if (!/^\d+$/.test(bossId)) return err('NOT_FOUND');
  try {
    const [b] = (await db.execute(sql`select stage, server_id, status from world_bosses where id = ${bossId}::bigint`)) as unknown as { stage: number; server_id: number; status: string }[];
    if (!b || b.server_id !== g.sid) return err('NOT_FOUND');
    if (b.status !== 'active') return err('BOSS_NOT_ACTIVE');
    const known = new Set((await knownWeakOf(bossId, currentPhase(b.stage).index)).map((w) => w.code));
    const best = await bestLoadoutOf(g.sid, g.u, known);
    if (!best) return err('ALREADY_EQUIPPED');
    await equipItems(g.u, best.ueids.map((id) => BigInt(id)), g.sid);
    rev(bossId);
    return { status: 'success' as const };
  } catch (e) {
    if (e instanceof EquipError) return err('UNKNOWN');
    return fail(e, 'equipBest');
  }
}
