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
  speedUpResidenceMove,
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
  getGuildSummaryRef,
  generateAndStoreEmblem,
  markEmblemStatus,
  setActiveEmblem,
  deleteEmblem,
  setViceRole,
  setVicePermissions,
  kickMember,
  transferLeadership,
} from '@/lib/game/guild';
import { notifyJoinDecision, notifyJoinRequest } from '@/lib/game/guild/notify';
import { getGuildPermState } from '@/lib/game/guild/perm-guard';
import { hasGuildPerm } from '@/lib/game/guild/permissions';
import { getGuild } from '@/lib/game/guild/queries';
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
    const { guildId } = await createGuild({
      userId: u,
      serverId: await getActiveServerId(),
      name,
      emblemColor: mainColor(emblem.mainToneId),
      emblemSelection: emblem, // 최초 생성 실패 시 cron 재시도 원본
    });
    // 문양 생성은 여기서 돌리지 않는다(2026-08-06) — 실측 소요 20~97초인데 (game) 라우트의
    // maxDuration은 60초라 정상 생성까지 kill되고 상태가 pending으로 굳었다. 상태만 pending으로
    // 찍고, 실제 생성은 180초 예산의 전용 라우트(/api/guild/emblem/generate)가 맡는다 —
    // 길드 홈이 도착 즉시 킥하고, 그마저 놓치면 재시도 크론이 이어받는다.
    await markEmblemStatus(guildId, 'pending');
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
    // 승인제 신청이면 처리할 수 있는 사람(길드장 + joinReview 권한 부길드장)에게 알린다.
    // 커밋 후 best-effort — 발송 실패가 신청을 되돌리지 않는다.
    if (!r.joined) {
      after(async () => {
        await notifyJoinRequest({
          guildId: r.guildId,
          serverId: r.serverId,
          applicantUserId: u,
        }).catch(() => undefined);
      });
    }
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
    const r = await approveJoinRequest({
      actorUserId: u,
      serverId: await getActiveServerId(),
      requestUserId,
    });
    after(async () => {
      await notifyJoinDecision({
        userId: requestUserId,
        guildId: r.guildId,
        approved: true,
      }).catch(() => undefined);
    });
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
    const r = await rejectJoinRequest({
      actorUserId: u,
      serverId: await getActiveServerId(),
      requestUserId,
    });
    after(async () => {
      await notifyJoinDecision({
        userId: requestUserId,
        guildId: r.guildId,
        approved: false,
      }).catch(() => undefined);
    });
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

export async function setResidenceAction(
  zoneId: number,
  opts: { release?: boolean; paySpeedUp?: boolean } = {},
) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    const r = await setResidence(u, await getActiveServerId(), zoneId, opts);
    revalidatePath('/guild');
    revalidatePath('/guild/deploy'); // 거주지 상태를 쓰는 배치 화면 — 클라 refresh 제거(2026-08-06) 커버
    return { status: 'success', ...r } as const;
  } catch (e) {
    return fail(e, 'residence');
  }
}

/** 거주 이동 쿨타임 보석 단축 — 대기시간만 없앤다(이동은 별도). */
export async function speedUpResidenceAction() {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    const r = await speedUpResidenceMove(u, await getActiveServerId());
    revalidatePath('/guild');
    revalidatePath('/guild/deploy'); // 거주지 상태를 쓰는 배치 화면 — 클라 refresh 제거(2026-08-06) 커버
    return { status: 'success', spent: r.spent } as const;
  } catch (e) {
    return fail(e, 'residence.speedup');
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
    revalidatePath('/guild/map'); // 수금 버튼이 있는 화면 — 응답 재렌더로 수금 상태 반영(클라 refresh 제거)
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

export async function deployAction(
  zoneId: number,
  role: ConquestRole,
  opts: { move?: boolean; paySpeedUp?: boolean } = {},
) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    const r = await deployToZone({
      userId: u,
      serverId: await getActiveServerId(),
      zoneId,
      role,
      ...opts,
    });
    revalidatePath('/guild/map');
    revalidatePath('/guild');
    revalidatePath('/guild/deploy'); // 배치 화면 — 클라 refresh 제거(2026-08-06)에 따른 명시 커버
    return { status: 'success', ...r } as const;
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

/**
 * 부길드장 권한 설정 — **길드장 전속**(0142). 대상은 같은 길드의 부길드장.
 * 비트마스크는 서버에서 sanitize하므로 클라가 알 수 없는 비트를 보내도 버려진다.
 */
export async function setVicePermissionsAction(targetUserId: string, permissions: number) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  if (await rateLimited(u, 'guild')) return { status: 'error', code: 'RATE_LIMITED' } as const;
  const __b = await actionBlock(); if (__b) return { status: 'error', code: __b } as const;
  try {
    await setVicePermissions({
      leaderUserId: u,
      serverId: await getActiveServerId(),
      targetUserId,
      permissions,
    });
    revalidatePath('/guild/settings');
    revalidatePath('/guild');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'setVicePermissions');
  }
}

/**
 * 길드 요약 — 세계지도 연대기 길드명 클릭 팝업용. 없으면 guild=null.
 * guildId는 연대기 마커의 3번째 필드(불변) — 있으면 그것으로만 찾는다(동명 재사용 오귀속 차단).
 */
export async function getGuildSummaryAction(name: string, guildId?: number) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    const guild = await getGuildSummaryRef(await getActiveServerId(), { guildId, name });
    return { status: 'success', guild } as const;
  } catch (e) {
    return fail(e, 'guildSummary');
  }
}
