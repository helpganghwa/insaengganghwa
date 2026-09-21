'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { CharacterError, createCharacterAuto, touchLastServer, canEnterServer } from '@/lib/game/server-select';
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
  // 실패하면 같은 화면으로 돌아가 알린다 — 그냥 던지면 버튼이 아무 반응 없이 끝난다.
  // (redirect는 예외로 동작하므로 try 밖에서 부른다.)
  let failed = false;
  try {
    if (!(await canEnterServer(userId, serverId))) {
      await createCharacterAuto({ userId, serverId });
    }
  } catch (e) {
    // 두 번 눌러 동시에 들어온 요청 — 다른 쪽이 이미 만들었다. 성공으로 이어 간다.
    if (!(e instanceof CharacterError && e.code === 'ALREADY_EXISTS')) {
      failed = true;
      console.error('[new-character] create failed', { userId, serverId }, e);
    }
  }
  if (failed) redirect(`/login/new-character?to=${serverId}&e=1`);
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
