'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { createCharacterAuto, touchLastServer, canEnterServer } from '@/lib/game/server-select';
import { listServers } from '@/lib/game/servers';

/**
 * "이 서버에서 새로 시작" 확정(2026-09-21 ②) — 확인 화면의 버튼만 이 액션을 부른다.
 * 로그인 콜백은 더 이상 말없이 캐릭터를 만들지 않는다(다른 서버에 캐릭터가 있을 때).
 */
export async function startOnServerAction(serverId: number): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');
  const open = (await listServers()).find((s) => s.id === serverId && s.status === 'open');
  if (!open) redirect('/login');

  // 이미 있으면 만들지 않는다(중복 클릭·뒤로가기 방어). 없으면 생성.
  if (!(await canEnterServer(userId, serverId))) {
    await createCharacterAuto({ userId, serverId });
  }
  await touchLastServer(userId, serverId);
  (await cookies()).set('srv', String(serverId), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect('/');
}
