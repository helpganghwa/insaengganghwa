import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { listServersForUser } from '@/lib/game/server-select';
import { correctServerFor } from '@/lib/game/server-guard';

import { NewCharacterChoice } from './NewCharacterChoice';

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

  const back = await correctServerFor(userId, serverId);
  if (back == null) redirect('/'); // 캐릭터가 아예 없는 계정 — 콜백이 알아서 만든다
  const backServer = servers.find((s) => s.id === back);

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[390px] flex-col justify-center gap-6 px-7 py-12">
      <div className="flex flex-col gap-2.5">
        <h1 className="text-[22px] font-bold leading-snug text-zinc-900 dark:text-zinc-50">
          {target.name}에는 아직
          <br />
          캐릭터가 없어요
        </h1>
        <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          {backServer?.my ? (
            <>
              <b className="text-zinc-700 dark:text-zinc-200">{backServer.name}</b>에서 <b className="text-zinc-700 dark:text-zinc-200">{backServer.my.nickname}</b>으로
              하던 기록은 그대로 있어요.
              <br />
              거기로 돌아가거나, {target.name}에서 처음부터 시작할 수 있어요.
            </>
          ) : (
            <>하던 기록은 그대로 있어요. 돌아가거나 여기서 처음부터 시작할 수 있어요.</>
          )}
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 dark:border-zinc-800 dark:bg-zinc-900/60">
        <p className="text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          새로 시작하면 다이아·장비·강화가 {target.name} 것으로 따로 쌓여요. 서버끼리 옮길 수 없고,
          만든 캐릭터는 지울 수 없어요.
        </p>
      </div>

      <NewCharacterChoice
        serverId={serverId}
        serverName={target.name}
        backHref={`/auth/switch-server?to=${back}`}
        backLabel={backServer ? `${backServer.name}로 돌아가기` : '원래 서버로 돌아가기'}
      />
    </main>
  );
}
