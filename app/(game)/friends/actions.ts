'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import {
  searchUsers,
  sendRequest,
  respondRequest,
  cancelRequest,
  removeFriend,
  FriendError,
  type FriendRelation,
  type FriendUser,
} from '@/lib/game/friends';

type SearchRow = FriendUser & { relation: FriendRelation };

export async function searchAction(q: string) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  try {
    return { status: 'success', results: await searchUsers(u, await getActiveServerId(), q) as SearchRow[] } as const;
  } catch (e) {
    console.error('[friends.search]', e);
    return { status: 'error', code: 'UNKNOWN' } as const;
  }
}

export async function sendRequestAction(targetId: string) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  try {
    const r = await sendRequest(u, await getActiveServerId(), targetId);
    revalidatePath('/friends');
    return { status: 'success', result: r.status } as const;
  } catch (e) {
    if (e instanceof FriendError) return { status: 'error', code: e.code } as const;
    console.error('[friends.send]', e);
    return { status: 'error', code: 'UNKNOWN' } as const;
  }
}

export async function respondAction(requesterId: string, action: 'accept' | 'decline') {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  try {
    await respondRequest(u, await getActiveServerId(), requesterId, action);
    revalidatePath('/friends');
    return { status: 'success' } as const;
  } catch (e) {
    if (e instanceof FriendError) return { status: 'error', code: e.code } as const;
    console.error('[friends.respond]', e);
    return { status: 'error', code: 'UNKNOWN' } as const;
  }
}

export async function cancelAction(targetId: string) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  try {
    await cancelRequest(u, await getActiveServerId(), targetId);
    revalidatePath('/friends');
    return { status: 'success' } as const;
  } catch (e) {
    console.error('[friends.cancel]', e);
    return { status: 'error', code: 'UNKNOWN' } as const;
  }
}

export async function removeFriendAction(otherId: string) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  try {
    await removeFriend(u, await getActiveServerId(), otherId);
    revalidatePath('/friends');
    return { status: 'success' } as const;
  } catch (e) {
    console.error('[friends.remove]', e);
    return { status: 'error', code: 'UNKNOWN' } as const;
  }
}
