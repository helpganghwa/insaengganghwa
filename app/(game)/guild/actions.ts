'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import {
  GuildError,
  createGuild,
  searchGuilds,
  joinGuild,
  leaveGuild,
  disbandGuild,
  donateToGuild,
  setResidence,
  collectZoneTax,
  distributeGuildTax,
} from '@/lib/game/guild';
import type { GuildTaxDistribution } from '@/lib/game/guild/balance';

type Fail = { status: 'error'; code: string };
const unauth = { status: 'error', code: 'UNAUTHENTICATED' } as const;

function fail(e: unknown, tag: string): Fail {
  if (e instanceof GuildError) return { status: 'error', code: e.code };
  console.error(`[guild.${tag}]`, e);
  return { status: 'error', code: 'UNKNOWN' };
}

export async function createGuildAction(name: string) {
  const u = await getSessionUserId();
  if (!u) return unauth;
  try {
    const { guildId } = await createGuild({ userId: u, name });
    revalidatePath('/guild');
    return { status: 'success', guildId: guildId.toString() } as const;
  } catch (e) {
    return fail(e, 'create');
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
    await joinGuild({ userId: u, guildId: BigInt(guildId) });
    revalidatePath('/guild');
    return { status: 'success' } as const;
  } catch (e) {
    return fail(e, 'join');
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
    return { status: 'success', lordGain: r.lordGain.toString(), guildGain: r.guildGain.toString() } as const;
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
