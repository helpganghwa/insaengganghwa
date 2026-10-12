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
import { WorldBossError, type WorldBossErrorCode } from '@/lib/game/world-boss/errors';
import { cancelInvite, cancelJoinRequest, createParty, decideJoin, departParty, inviteToParty, kickMember, leaveParty, requestJoin, respondInvite } from '@/lib/game/world-boss/party';
import { getWorldBossBattle, getWorldBossDepartedMore, getWorldBossInvitable, getWorldBossStatus } from '@/lib/game/world-boss/queries';
import { bestLoadoutOf, knownWeakOf } from '@/lib/game/world-boss/loadout';
import { WORLD_BOSS_PARTY_MAX, parseWorldBossTraits, worldBossWeakBonus } from '@/lib/game/guild/balance';
import { EquipError, equipItems } from '@/lib/game/equipment/equip';
import { activateProfile } from '@/lib/game/profile/active';
import { db } from '@/lib/db/client';
import { sql } from 'drizzle-orm';

const MSG = {
  NOT_FOUND: '원정대를 찾을 수 없어요.',
  BOSS_NOT_FOUND: '보스를 찾을 수 없어요.',
  BOSS_NOT_ACTIVE: '원정이 이미 종료됐어요.',
  NOT_OWNER_GUILD: '원정대는 이 구역을 가진 길드원만 만들 수 있어요.',
  NO_CHARACTER: '이 서버에 캐릭터가 없어요.',
  ALREADY_IN_PARTY: '이미 이 보스의 원정대에 들어가 있어요.',
  ALREADY_FOUGHT: '이 보스와는 이미 싸웠어요. 보스 하나에 1번만 참가할 수 있어요.',
  ALREADY_REQUESTED: '이미 이 원정대에 신청했어요.',
  KICKED: '내보내진 원정대에는 다시 신청할 수 없어요.',
  NO_REQUEST: '신청이 이미 처리됐어요.',
  PARTY_NOT_RECRUITING: '이미 출발했거나 해산된 원정대예요.',
  PARTY_FULL: `원정대가 가득 찼어요(최대 ${WORLD_BOSS_PARTY_MAX}명).`,
  PROFANITY: '소개글에 쓸 수 없는 말이 있어요.',
  SLOT_TAKEN: '다른 곳에서 장착이 바뀌었어요. 다시 시도해 주세요.',
  NOT_LEADER: '원정대장만 할 수 있어요.',
  NOT_MEMBER: '원정대원이 아니에요.',
  ALREADY_INVITED: '이미 초대했어요. 상대의 응답을 기다려요.',
  NO_INVITE: '초대가 이미 처리됐어요.',
  NOT_INVITABLE: '친구나 같은 길드원만 초대할 수 있어요.',
  UNAUTHENTICATED: '로그인이 필요해요.',
  RATE_LIMITED: '요청이 너무 빨라요. 잠시 후 다시 시도해 주세요.',
  MAINTENANCE: '서버 점검 중이에요. 잠시 후 다시 시도해 주세요.',
  BANNED: '이용이 제한된 계정이에요.',
  ALREADY_EQUIPPED: '이미 가장 좋은 조합으로 장착하고 있어요.',
  UNKNOWN: '지금은 처리할 수 없어요. 잠시 후 다시 시도해 주세요.',
} satisfies Record<WorldBossErrorCode, string> & Record<string, string>; // 코드가 빠지면 컴파일러가 잡는다(10-11 재검사)
const err = makeErr(MSG);

async function gate(): Promise<{ u: string; sid: number } | ReturnType<typeof err>> {
  const u = await getSessionUserId();
  if (!u) return err('UNAUTHENTICATED');
  if (await rateLimited(u, 'worldBoss')) return err('RATE_LIMITED');
  const b = await actionBlock();
  if (b) return err(b);
  return { u, sid: await getActiveServerId() };
}
// 입력 모양 검사 — 잘못된 id는 DB 캐스트 오류(로그 소음)가 아니라 '찾을 수 없어요'로 끝낸다(10-11 감사).
const isId = (v: unknown): v is string => typeof v === 'string' && /^\d{1,18}$/.test(v);
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function rev(bossId: string) {
  revalidatePath(`/world-boss/${bossId}`);
  revalidatePath('/guild/map');
}
function fail(e: unknown, where: string) {
  if (e instanceof WorldBossError) return err(e.code);
  console.error(`[world-boss.${where}]`, e);
  return err('UNKNOWN');
}

export async function createPartyAction(bossId: string, intro?: string) {
  const g = await gate();
  if ('status' in g) return g;
  if (!isId(bossId)) return err('BOSS_NOT_FOUND');
  try {
    const r = await createParty({ userId: g.u, serverId: g.sid, bossId, intro: typeof intro === 'string' ? intro : undefined });
    rev(bossId);
    return { status: 'success' as const, partyId: r.partyId };
  } catch (e) {
    return fail(e, 'create');
  }
}

export async function requestJoinAction(bossId: string, partyId: string) {
  const g = await gate();
  if ('status' in g) return g;
  if (!isId(bossId) || !isId(partyId)) return err('NOT_FOUND');
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
  if (!isId(bossId) || !isId(partyId)) return err('NOT_FOUND');
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
  if (!isId(bossId) || !isId(partyId) || !isUuid(userId) || typeof accept !== 'boolean') return err('NOT_FOUND');
  try {
    await decideJoin({ leaderUserId: g.u, serverId: g.sid, partyId, userId, accept });
    rev(bossId);
    return { status: 'success' as const };
  } catch (e) {
    return fail(e, 'decide');
  }
}

/** 대원 내보내기 — 대장만, 출발 전(10-11 사용자 결정 ⑨). */
export async function kickMemberAction(bossId: string, partyId: string, userId: string) {
  const g = await gate();
  if ('status' in g) return g;
  if (!isId(bossId) || !isId(partyId) || !isUuid(userId)) return err('NOT_FOUND');
  try {
    await kickMember({ leaderUserId: g.u, serverId: g.sid, partyId, userId });
    rev(bossId);
    return { status: 'success' as const };
  } catch (e) {
    return fail(e, 'kick');
  }
}

export async function leavePartyAction(bossId: string, partyId: string) {
  const g = await gate();
  if ('status' in g) return g;
  if (!isId(bossId) || !isId(partyId)) return err('NOT_FOUND');
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
  if (!isId(bossId) || !isId(partyId) || typeof departKey !== 'string') return err('NOT_FOUND');
  try {
    const r = await departParty({ leaderUserId: g.u, serverId: g.sid, partyId, departKey });
    rev(bossId);
    // 기록(finale)의 명단 UUID는 내리지 않는다(10-11 사용자 결정 ②) — 다시 보기와 같은 재생 데이터(순번·얼굴·문양)를 서버가 만든다.
    const { finale: _finale, ...rest } = r;
    const battle = r.finale ? await getWorldBossBattle(partyId, g.sid, g.u) : null;
    return { status: 'success' as const, result: { ...rest, battle } };
  } catch (e) {
    return fail(e, 'depart');
  }
}

/** 종료 시각 타이머용 상태 1쿼리(10-11 3차) — 화면은 상태가 바뀌었을 때만 전체를 다시 읽는다. */
export async function bossStatusAction(bossId: string) {
  const g = await gate();
  if ('status' in g) return g;
  if (!isId(bossId)) return err('NOT_FOUND');
  const s = await getWorldBossStatus(bossId, g.sid).catch(() => null);
  if (!s) return err('BOSS_NOT_FOUND');
  return { status: 'success' as const, state: s.state, weak: s.weak };
}

/** 전투 다시 보기 — 저장된 전투 기록. 그 원정대원만, 같은 서버(10-11 사용자). */
export async function getBattleAction(partyId: string) {
  const g = await gate(); // 레이트리밋·점검 게이트 — 읽기 액션도 무제한 호출은 막는다(10-11 3차)
  if ('status' in g) return g;
  const u = g.u;
  if (!isId(partyId)) return err('NOT_FOUND');
  try {
    const b = await getWorldBossBattle(partyId, g.sid, u); // 그 원정대원만(10-11 사용자)
    if (!b) return err('NOT_FOUND');
    return { status: 'success' as const, battle: b };
  } catch (e) {
    return fail(e, 'battle');
  }
}

/**
 * 추천 장비 장착 — 가진 장비와 보유 아바타 전부를 후보로, 공개된 약점과 아바타 보너스까지 계산한 가장 좋은 조합(장비 3개 + 대표 아바타)으로 한 번에
 * (docs/WORLD-BOSS.md §3, 무한의 탑 자동 장착과 같은 규칙, 10-12). 장착·대표 아바타는 게임 전체에 적용된다. 판정은 서버가 다시 계산하므로 클라가 보낸 값은 없다.
 */
export async function equipBestAction(bossId: string) {
  const g = await gate();
  if ('status' in g) return g;
  if (!isId(bossId)) return err('BOSS_NOT_FOUND');
  try {
    const [[b], knownRows] = await Promise.all([
      db.execute(sql`select server_id, status, traits, (leave_at > now()) as alive from world_bosses where id = ${bossId}::bigint`) as unknown as Promise<{ server_id: number; status: string; traits: unknown; alive: boolean }[]>,
      knownWeakOf(bossId),
    ]);
    if (!b || b.server_id !== g.sid) return err('BOSS_NOT_FOUND');
    if (b.status === 'scheduled') return err('BOSS_NOT_FOUND'); // 예정 보스는 없는 것처럼(운영자 소환 비노출 — 다른 액션의 lockActiveBoss와 같은 판정, 10-12)
    if (b.status !== 'active' || !b.alive) return err('BOSS_NOT_ACTIVE'); // 종료 판정은 DB 시계(정산과 같은 시계)
    const known = new Set(knownRows.map((w) => w.code));
    // 약점 보너스는 보스 특성(치명 약점)에 따라 다르다 — 제안 계산도 같은 값으로.
    const best = await bestLoadoutOf(g.sid, g.u, known, worldBossWeakBonus(parseWorldBossTraits(b.traits)));
    if (!best) return err('ALREADY_EQUIPPED');
    if (best.ueids.length) await equipItems(g.u, best.ueids.map((id) => BigInt(id)), g.sid);
    // 대표 아바타까지 — 출발 전투력은 대표 아바타 기준(party.ts)이라 바꿔야 제안한 값이 실제가 된다. 장착이 먼저(실패하면 아바타는 그대로).
    if (best.avatarId) {
      await activateProfile(g.u, g.sid, best.avatarId);
      revalidatePath('/me');
      revalidatePath('/me/profiles');
    }
    rev(bossId);
    return { status: 'success' as const };
  } catch (e) {
    if (e instanceof EquipError) return err(e.code === 'SLOT_TAKEN' ? 'SLOT_TAKEN' : 'UNKNOWN');
    return fail(e, 'equipBest');
  }
}

/** 종료 목록 더 보기(10-11 사용자) — 상세에 실리지 않은 출발 원정대(피해 순). */
export async function moreDepartedAction(bossId: string, shownIds: string[]) {
  const g = await gate();
  if ('status' in g) return g;
  if (!isId(bossId) || !Array.isArray(shownIds)) return err('BOSS_NOT_FOUND');
  try {
    const parties = await getWorldBossDepartedMore(bossId, g.sid, shownIds.filter((x) => typeof x === 'string'));
    return { status: 'success' as const, parties };
  } catch (e) {
    return fail(e, 'moreDeparted');
  }
}

/** 초대 후보 목록 — 대장이 초대 시트를 열 때(10-11 사용자 2안). */
export async function invitableAction(partyId: string) {
  const g = await gate();
  if ('status' in g) return g;
  if (!isId(partyId)) return err('NOT_FOUND');
  try {
    const people = await getWorldBossInvitable(g.sid, g.u, partyId);
    return { status: 'success' as const, people };
  } catch (e) {
    return fail(e, 'invitable');
  }
}

export async function inviteAction(bossId: string, partyId: string, userId: string) {
  const g = await gate();
  if ('status' in g) return g;
  if (!isId(bossId) || !isId(partyId) || !isUuid(userId)) return err('NOT_FOUND');
  try {
    await inviteToParty({ leaderUserId: g.u, serverId: g.sid, partyId, userId });
    rev(bossId);
    return { status: 'success' as const };
  } catch (e) {
    return fail(e, 'invite');
  }
}

export async function cancelInviteAction(bossId: string, partyId: string, userId: string) {
  const g = await gate();
  if ('status' in g) return g;
  if (!isId(bossId) || !isId(partyId) || !isUuid(userId)) return err('NOT_FOUND');
  try {
    await cancelInvite({ leaderUserId: g.u, serverId: g.sid, partyId, userId });
    rev(bossId);
    return { status: 'success' as const };
  } catch (e) {
    return fail(e, 'cancelInvite');
  }
}

/** 초대 응답 — 수락하면 바로 참가, 거절은 줄만 닫는다. */
export async function respondInviteAction(bossId: string, partyId: string, accept: boolean) {
  const g = await gate();
  if ('status' in g) return g;
  if (!isId(bossId) || !isId(partyId)) return err('NOT_FOUND');
  try {
    await respondInvite({ userId: g.u, serverId: g.sid, partyId, accept: accept === true });
    rev(bossId);
    return { status: 'success' as const };
  } catch (e) {
    return fail(e, 'respondInvite');
  }
}
