'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import {
  createCharacter,
  canEnterServer,
  touchLastServer,
  suggestNickname,
  CharacterError,
} from '@/lib/game/server-select';

/** srv 쿠키 — getActiveServerId()가 읽는 활성 서버(SERVER.md §3). 1년, httpOnly. */
async function setSrvCookie(serverId: number) {
  (await cookies()).set('srv', String(serverId), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** 서버 입장 — 캐릭터 보유 서버만. 쿠키 + last_server_id 갱신. */
export async function enterServerAction(serverId: number) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  if (!Number.isInteger(serverId) || serverId < 1) return { status: 'error', code: 'INVALID' } as const;
  if (!(await canEnterServer(u, serverId))) return { status: 'error', code: 'NO_CHARACTER' } as const;
  await setSrvCookie(serverId);
  await touchLastServer(u, serverId).catch(() => {});
  revalidatePath('/', 'layout');
  return { status: 'success' } as const;
}

/** 캐릭터 생성 + 즉시 입장. */
export async function createCharacterAction(serverId: number, nickname: string) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  try {
    await createCharacter({ userId: u, serverId, nickname });
  } catch (e) {
    if (e instanceof CharacterError) return { status: 'error', code: e.code } as const;
    console.error('[servers.create]', e);
    return { status: 'error', code: 'UNKNOWN' } as const;
  }
  await setSrvCookie(serverId);
  await touchLastServer(u, serverId).catch(() => {});
  revalidatePath('/', 'layout');
  return { status: 'success' } as const;
}

/** 닉네임 자동 제안(생성 폼 초기값/재추첨). */
export async function suggestNicknameAction() {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  return { status: 'success', nickname: await suggestNickname() } as const;
}
