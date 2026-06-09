'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import { getSessionUserId } from '@/lib/auth/session';
import {
  GuildError,
  createGuild,
  searchGuilds,
  requestOrJoinGuild,
  approveJoinRequest,
  rejectJoinRequest,
  setJoinPolicy,
  leaveGuild,
  disbandGuild,
  donateToGuild,
  setResidence,
  collectZoneTax,
  distributeGuildTax,
  deployToZone,
  cancelDeployment,
  deployMember,
  clearMemberDeployment,
  setZoneExecutor,
  clearZoneExecutor,
  getZoneLatestBattle,
  generateAndStoreEmblem,
  rerollEmblem,
  setViceRole,
  kickMember,
  transferLeadership,
} from '@/lib/game/guild';
import type { GuildTaxDistribution, ConquestRole, GuildJoinPolicy } from '@/lib/game/guild/balance';
import type { ConquestFinale } from '@/lib/game/guild/conquest/simulate';
import {
  isValidEmblemSelection,
  toneColor,
  type EmblemSelection,
} from '@/lib/game/guild/emblem-vocab';

type Fail = { status: 'error'; code: string };
const unauth = { status: 'error', code: 'UNAUTHENTICATED' } as const;

function fail(e: unknown, tag: string): Fail {
  if (e instanceof GuildError) return { status: 'error', code: e.code };
  console.error(`[guild.${tag}]`, e);
  return { status: 'error', code: 'UNKNOWN' };
}

export async function createGuildAction(name: string, emblem: EmblemSelection) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (!isValidEmblemSelection(emblem)) return { status: 'error', code: 'EMBLEM_INVALID' } as const;
  try {
    const { guildId } = await createGuild({ userId: u, name, emblemColor: toneColor(emblem.toneId) });
    // 문양 생성(Pixellab ~수초)은 응답 이후로 미뤄 결성을 즉시 반환(낙관적 UX).
    // best-effort — 실패해도 길드는 유지(폴백 문양·재생성으로 커버). 완료 시 /guild 무효화.
    after(async () => {
      try {
        await generateAndStoreEmblem({ guildId, selection: emblem });
        revalidatePath('/guild');
      } catch (ge) {
        console.error('[guild.create.emblem]', ge);
      }
    });
    revalidatePath('/guild');
    return { status: 'success', guildId: guildId.toString() } as const;
  } catch (e) {
    return fail(e, 'create');
  }
}

export async function rerollEmblemAction(emblem: EmblemSelection) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (!isValidEmblemSelection(emblem)) return { status: 'error', code: 'EMBLEM_INVALID' } as const;
  try {
    await rerollEmblem({ userId: u, selection: emblem });
    revalidatePath('/guild');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'rerollEmblem');
  }
}

export async function searchGuildsAction(q: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    const rows = await searchGuilds(q);
    return {
      status: 'success',
      results: rows.map((r) => ({ ...r, id: r.id.toString() })),
    } as const;
  } catch (e) {
    return fail(e, 'search');
  }
}

export async function joinGuildAction(guildId: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    const r = await requestOrJoinGuild({ userId: u, guildId: BigInt(guildId) });
    revalidatePath('/guild');
    return { status: 'success', joined: r.joined } as const;
  } catch (e) {
    return fail(e, 'join');
  }
}

export async function approveJoinAction(requestUserId: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    await approveJoinRequest({ actorUserId: u, requestUserId });
    revalidatePath('/guild');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'approveJoin');
  }
}

export async function rejectJoinAction(requestUserId: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    await rejectJoinRequest({ actorUserId: u, requestUserId });
    revalidatePath('/guild');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'rejectJoin');
  }
}

export async function setJoinPolicyAction(policy: GuildJoinPolicy) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (policy !== 'open' && policy !== 'approval') {
    return { status: 'error', code: 'UNKNOWN' } as const;
  }
  try {
    await setJoinPolicy({ userId: u, policy });
    revalidatePath('/guild');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'setJoinPolicy');
  }
}

export async function leaveGuildAction() {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    const r = await leaveGuild({ userId: u });
    revalidatePath('/guild');
    return { status: 'success', disbanded: r.disbanded } as const;
  } catch (e) {
    return fail(e, 'leave');
  }
}

export async function setViceAction(targetUserId: string, makeVice: boolean) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    await setViceRole({ leaderUserId: u, targetUserId, makeVice });
    revalidatePath('/guild');
    revalidatePath('/guild/settings');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'setVice');
  }
}

export async function kickMemberAction(targetUserId: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    await kickMember({ actorUserId: u, targetUserId });
    revalidatePath('/guild');
    revalidatePath('/guild/settings');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'kick');
  }
}

export async function transferLeadershipAction(targetUserId: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    await transferLeadership({ leaderUserId: u, targetUserId });
    revalidatePath('/guild');
    revalidatePath('/guild/settings');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'transfer');
  }
}

export async function disbandGuildAction() {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    await disbandGuild({ userId: u });
    revalidatePath('/guild');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'disband');
  }
}

export async function donateAction() {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    const r = await donateToGuild({ userId: u });
    revalidatePath('/guild');
    return { status: 'success', ...r } as const;
  } catch (e) {
    return fail(e, 'donate');
  }
}

export async function setResidenceAction(zoneId: number) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    await setResidence(u, zoneId);
    revalidatePath('/guild');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'residence');
  }
}

export async function collectTaxAction(zoneId: number) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    const r = await collectZoneTax({ userId: u, zoneId });
    revalidatePath('/guild');
    return { status: 'success', executorGain: r.executorGain.toString(), guildGain: r.guildGain.toString() } as const;
  } catch (e) {
    return fail(e, 'collect');
  }
}

export async function distributeTaxAction(mode: GuildTaxDistribution, targetUserId?: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    const r = await distributeGuildTax({ leaderUserId: u, mode, targetUserId });
    revalidatePath('/guild');
    return {
      status: 'success',
      total: r.total.toString(),
      perMember: r.perMember?.toString() ?? null,
    } as const;
  } catch (e) {
    return fail(e, 'distribute');
  }
}

// ── 점령전 (§5.8) ──

export async function deployAction(zoneId: number, role: ConquestRole) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    const r = await deployToZone({ userId: u, zoneId, role });
    revalidatePath('/guild/map');
    revalidatePath('/guild');
    return { status: 'success', battleKstDay: r.battleKstDay } as const;
  } catch (e) {
    return fail(e, 'deploy');
  }
}

export async function cancelDeployAction() {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    const r = await cancelDeployment({ userId: u });
    revalidatePath('/guild/map');
    revalidatePath('/guild');
    return { status: 'success', cancelled: r.cancelled } as const;
  } catch (e) {
    return fail(e, 'cancelDeploy');
  }
}

export async function deployMemberAction(targetUserId: string, zoneId: number, role: ConquestRole) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    await deployMember({ actorUserId: u, targetUserId, zoneId, role });
    revalidatePath('/guild/deploy');
    revalidatePath('/guild/map');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'deployMember');
  }
}

export async function clearMemberDeploymentAction(targetUserId: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    await clearMemberDeployment({ actorUserId: u, targetUserId });
    revalidatePath('/guild/deploy');
    revalidatePath('/guild/map');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'clearMemberDeployment');
  }
}

export async function setExecutorAction(zoneId: number, targetUserId: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    await setZoneExecutor({ actorUserId: u, zoneId, targetUserId });
    revalidatePath('/guild/map');
    revalidatePath('/guild');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'setExecutor');
  }
}

export async function clearExecutorAction(zoneId: number) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    await clearZoneExecutor({ actorUserId: u, zoneId });
    revalidatePath('/guild/map');
    revalidatePath('/guild');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'clearExecutor');
  }
}

/** 구역 최근 전투 결과/리플레이 조회(없으면 battle null). */
export async function getZoneBattleAction(zoneId: number) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    const b = await getZoneLatestBattle(zoneId);
    if (!b) return { status: 'success', battle: null } as const;
    return {
      status: 'success',
      battle: {
        battleKstDay: b.battleKstDay,
        winnerGuildId: b.winnerGuildId?.toString() ?? null,
        winnerName: b.winnerName,
        finale: (b.finale as ConquestFinale) ?? { roster: [], events: [] },
      },
    } as const;
  } catch (e) {
    return fail(e, 'zoneBattle');
  }
}
