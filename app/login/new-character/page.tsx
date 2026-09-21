import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { listServersForUser } from '@/lib/game/server-select';
import { loadUserServers } from '@/lib/game/server-guard';

import { NewCharacterChoice, type MyServer } from './NewCharacterChoice';

export const dynamic = 'force-dynamic';

/**
 * 새 서버에서 시작할지 확인(2026-09-21 ②).
 *
 * 로그인 화면의 서버 칩을 눌렀는데 그 서버에 캐릭터가 없고 **다른 서버에는 있을 때** 콜백이 여기로
 * 보낸다. 종전에는 이 상황에서 확인 없이 캐릭터를 만들어, 화면이 골라 둔 서버를 그대로 누른
 * 기존 유저가 새 캐릭터를 받고 "계정이 초기화됐다"고 느꼈다(캐릭터 삭제 수단 없음).
 */
export default async function NewCharacterPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');

  const { to } = await searchParams;
  const n = Number(to);
  const serverId = Number.isInteger(n) && n >= 1 && n <= 32767 ? n : null;
  if (serverId == null) redirect('/');

  const servers = await listServersForUser(userId);
  const target = servers.find((s) => s.id === serverId);
  // 이미 캐릭터가 있거나(중복 진입) 열려 있지 않은 서버면 물을 것이 없다.
  if (!target || target.my || target.status !== 'open') redirect('/');

  // 캐릭터가 있는 서버 전부 — 마지막으로 하던 곳이 맨 앞(서버가 셋 이상이면 어디로 갈지 고른다).
  const { preferred } = await loadUserServers(userId);
  const mine: MyServer[] = servers
    .filter((s) => s.my && s.id !== serverId)
    .map((s) => ({ id: s.id, name: s.name, nickname: s.my!.nickname, diamond: s.my!.diamond }))
    .sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : a.id - b.id));
  if (mine.length === 0) redirect('/'); // 캐릭터가 아예 없는 계정 — 콜백이 알아서 만든다

  const head = mine[0]!;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[390px] flex-col justify-center gap-6 px-7 py-12">
      <div className="flex flex-col gap-2.5">
        <h1 className="text-[22px] font-bold leading-snug text-zinc-900 dark:text-zinc-50">
          {target.name}에는 아직
          <br />
          캐릭터가 없어요
        </h1>
        <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          {mine.length === 1 ? (
            <>
              <b className="text-zinc-700 dark:text-zinc-200">{head.name}</b>에서{' '}
              <b className="text-zinc-700 dark:text-zinc-200">{head.nickname}</b>으로 하던 기록은
              그대로 있어요.
              <br />
              거기로 돌아가거나, {target.name}에서 처음부터 시작할 수 있어요.
            </>
          ) : (
            <>
              하던 기록은 그대로 있어요. 어디로 갈까요?
              <br />
              {target.name}에서 처음부터 시작할 수도 있어요.
            </>
          )}
        </p>
      </div>

      <NewCharacterChoice serverId={serverId} serverName={target.name} mine={mine} />
    </main>
  );
}
