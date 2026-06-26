'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { rateLimited } from '@/lib/ratelimit';
import { actionBlock } from '@/lib/game/action-gate';
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
  distributeGuildTaxManual,
  deployToZone,
  cancelDeployment,
  deployMember,
  clearMemberDeployment,
  setZoneExecutor,
  clearZoneExecutor,
  setGuildNotice,
  setGuildIntro,
  setGuildOpenchat,
  getZoneLatestBattleId,
  getGuildSummaryByName,
  generateAndStoreEmblem,
  setActiveEmblem,
  deleteEmblem,
  setViceRole,
  kickMember,
  transferLeadership,
} from '@/lib/game/guild';
import type { GuildTaxDistribution, ConquestRole, GuildJoinPolicy } from '@/lib/game/guild/balance';
import {
  isValidEmblemSelection,
  mainColor,
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
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  if (!isValidEmblemSelection(emblem)) return { status: 'error', code: 'EMBLEM_INVALID' } as const;
  try {
    const { guildId } = await createGuild({ userId: u, serverId: await getActiveServerId(), name, emblemColor: mainColor(emblem.mainToneId) });
    // 문양 생성(Pixellab ~수초)은 응답 이후로 미뤄 결성을 즉시 반환(낙관적 UX).
    // best-effort — 실패해도 길드는 유지(폴백 문양·재생성으로 커버). 완료 시 /guild 무효화.
    after(async () => {
      try {
        await generateAndStoreEmblem({ guildId, selection: emblem });
        revalidatePath('/guild');
        revalidatePath('/', 'layout'); // 헤더(공유 레이아웃) 문양 반영
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

// 헤더 문양은 (game) 공유 레이아웃(URL '/')에 있음 — page 리밸리데이트론 안 바뀜.
// 루트 layout 리밸리데이트로 모든 라우트의 헤더가 새 활성 문양을 즉시 반영.
function revalidateGuildAndHeader() {
  revalidatePath('/guild');
  revalidatePath('/guild/settings');
  revalidatePath('/', 'layout');
}

// 문양 생성은 라우트 핸들러(/api/guild/emblem)로 분리 — pixflux 생성이 서버 액션
// 트랜지션을 막아 앱이 멈추던 문제 회피. 선택/삭제만 액션으로 남김.

/** 보관 문양 중 활성 선택(무료). 길드장. */
export async function setActiveEmblemAction(emblemId: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    await setActiveEmblem({ userId: u, serverId: await getActiveServerId(), emblemId: BigInt(emblemId) });
    revalidateGuildAndHeader();
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'setActiveEmblem');
  }
}

/** 보관 문양 삭제(무료, 최소 1). 길드장. */
export async function deleteEmblemAction(emblemId: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    await deleteEmblem({ userId: u, serverId: await getActiveServerId(), emblemId: BigInt(emblemId) });
    revalidateGuildAndHeader();
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'deleteEmblem');
  }
}

export async function searchGuildsAction(q: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  try {
    const rows = await searchGuilds(await getActiveServerId(), q);
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
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
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
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    await approveJoinRequest({ actorUserId: u, serverId: await getActiveServerId(), requestUserId });
    revalidatePath('/guild');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'approveJoin');
  }
}

export async function rejectJoinAction(requestUserId: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    await rejectJoinRequest({ actorUserId: u, serverId: await getActiveServerId(), requestUserId });
    revalidatePath('/guild');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'rejectJoin');
  }
}

export async function setJoinPolicyAction(policy: GuildJoinPolicy) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  if (policy !== 'open' && policy !== 'approval') {
    return { status: 'error', code: 'UNKNOWN' } as const;
  }
  try {
    await setJoinPolicy({ userId: u, serverId: await getActiveServerId(), policy });
    revalidatePath('/guild');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'setJoinPolicy');
  }
}

/** 길드 공지 설정/해제 — 길드장·부길드장. 길드정보 섹션에 노출. */
export async function setGuildNoticeAction(notice: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    await setGuildNotice({ userId: u, serverId: await getActiveServerId(), notice });
    revalidatePath('/guild');
    revalidatePath('/guild/settings');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'setGuildNotice');
  }
}

/** 길드 소개(공개) 설정/해제 — 길드장·부길드장. 목록 팝업에 노출. */
export async function setGuildIntroAction(intro: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    await setGuildIntro({ userId: u, serverId: await getActiveServerId(), intro });
    revalidatePath('/guild');
    revalidatePath('/guild/settings');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'setGuildIntro');
  }
}

/** 길드 오픈채팅 링크 설정/해제 — 길드장·부길드장. 길드 홈에 버튼 노출. */
export async function setGuildOpenchatAction(url: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    await setGuildOpenchat({ userId: u, serverId: await getActiveServerId(), url });
    revalidatePath('/guild');
    revalidatePath('/guild/settings');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'setGuildOpenchat');
  }
}

export async function leaveGuildAction() {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    const r = await leaveGuild({ userId: u, serverId: await getActiveServerId() });
    revalidatePath('/guild');
    return { status: 'success', disbanded: r.disbanded } as const;
  } catch (e) {
    return fail(e, 'leave');
  }
}

export async function setViceAction(targetUserId: string, makeVice: boolean) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    await setViceRole({ leaderUserId: u, serverId: await getActiveServerId(), targetUserId, makeVice });
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
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    await kickMember({ actorUserId: u, serverId: await getActiveServerId(), targetUserId });
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
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    await transferLeadership({ leaderUserId: u, serverId: await getActiveServerId(), targetUserId });
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
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    await disbandGuild({ userId: u, serverId: await getActiveServerId() });
    revalidatePath('/guild');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'disband');
  }
}

export async function donateAction() {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    const r = await donateToGuild({ userId: u, serverId: await getActiveServerId() });
    revalidatePath('/guild');
    return { status: 'success', ...r } as const;
  } catch (e) {
    return fail(e, 'donate');
  }
}

export async function setResidenceAction(zoneId: number) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    await setResidence(u, await getActiveServerId(), zoneId);
    revalidatePath('/guild');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'residence');
  }
}

export async function collectTaxAction(zoneId: number) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
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
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    const r = await distributeGuildTax({ leaderUserId: u, serverId: await getActiveServerId(), mode, targetUserId });
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

/** 세금 풀 수동 분배 — 길드장. 길드원별 지정 금액 지급. */
export async function distributeTaxManualAction(amounts: { userId: string; amount: number }[]) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  if (!Array.isArray(amounts)) return { status: 'error', code: 'UNKNOWN' } as const;
  try {
    const r = await distributeGuildTaxManual({ leaderUserId: u, serverId: await getActiveServerId(), amounts });
    revalidatePath('/guild');
    revalidatePath('/guild/distribute');
    return { status: 'success', total: r.total.toString() } as const;
  } catch (e) {
    return fail(e, 'distributeManual');
  }
}

// ── 점령전 (§5.8) ──

export async function deployAction(zoneId: number, role: ConquestRole) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    const r = await deployToZone({ userId: u, serverId: await getActiveServerId(), zoneId, role });
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
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    const r = await cancelDeployment({ userId: u, serverId: await getActiveServerId() });
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
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    await deployMember({ actorUserId: u, serverId: await getActiveServerId(), targetUserId, zoneId, role });
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
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    await clearMemberDeployment({ actorUserId: u, serverId: await getActiveServerId(), targetUserId });
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
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
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
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    await clearZoneExecutor({ actorUserId: u, zoneId });
    revalidatePath('/guild/map');
    revalidatePath('/guild');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'clearExecutor');
  }
}

/** 구역 최근 전투 id 조회(없으면 battleId null) — 상세 전투 기록 페이지로 진입. */
export async function getZoneBattleAction(zoneId: number) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    const id = await getZoneLatestBattleId(zoneId);
    return { status: 'success', battleId: id != null ? id.toString() : null } as const;
  } catch (e) {
    return fail(e, 'zoneBattle');
  }
}

/** 길드 요약(이름) — 세계지도 연대기 길드명 클릭 팝업용. 없으면 guild=null. */
export async function getGuildSummaryByNameAction(name: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    const guild = await getGuildSummaryByName(await getActiveServerId(), name);
    return { status: 'success', guild } as const;
  } catch (e) {
    return fail(e, 'guildSummary');
  }
}
