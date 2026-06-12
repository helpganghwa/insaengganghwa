'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import {
  createCharacterAuto,
  canEnterServer,
  touchLastServer,
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

/**
 * 서버 이동 — 캐릭터 없으면 **자동 생성**(자동 닉네임, 가입과 동일 무마찰) 후 입장.
 * 쿠키(srv) + last_server_id 갱신. 반환 created에 새 캐릭터 닉(안내 토스트용).
 */
export async function enterServerAction(serverId: number) {
  const u = await getSessionUserId();
  if (!u) return { status: 'error', code: 'UNAUTHENTICATED' } as const;
  if (!Number.isInteger(serverId) || serverId < 1) return { status: 'error', code: 'INVALID' } as const;
  let created: string | null = null;
  if (!(await canEnterServer(u, serverId))) {
    try {
      created = (await createCharacterAuto({ userId: u, serverId })).nickname;
    } catch (e) {
      if (e instanceof CharacterError) return { status: 'error', code: e.code } as const;
      console.error('[servers.enter.create]', e);
      return { status: 'error', code: 'UNKNOWN' } as const;
    }
  }
  await setSrvCookie(serverId);
  await touchLastServer(u, serverId).catch(() => {});
  revalidatePath('/', 'layout');
  return { status: 'success', created } as const;
}
