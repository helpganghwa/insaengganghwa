import { redirect } from 'next/navigation';

import { getJosaPicker } from 'josa';

import { getSessionUserId } from '@/lib/auth/session';
import { loadUserServers } from '@/lib/game/server-guard';
import { listServersForUser, recommendedServerId } from '@/lib/game/server-select';
import { NewCharacterChoice } from '@/app/login/new-character/NewCharacterChoice';

export const dynamic = 'force-dynamic';

/** '은/는'·'(으)로' — 서버 이름·닉네임 끝소리에 맞춘다. */
const eun = getJosaPicker('은');
const ro = getJosaPicker('으로');

/**
 * 운영 종료 서버 안내(2026-10-12 결정: 닫힌 서버는 진입 차단 + 다른 서버로 안내).
 *
 * 캐릭터가 **닫힌(closed) 서버에만** 있는 계정이 온다 — 레이아웃·전환 라우트가 보낸다. 되돌릴 운영 중인
 * 서버가 없으므로 여기서 새 서버를 본인이 고른다(말없이 만들지 않는다 — 09-21 ②와 같은 원칙).
 * 운영 중인 서버에 캐릭터가 있으면 안내할 것이 없으니 그리로 보낸다.
 */
export default async function ServerClosedPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');

  const { ids, preferred, closedIds } = await loadUserServers(userId);
  if (ids.length > 0 && preferred != null) redirect(`/auth/switch-server?to=${preferred}`);
  if (closedIds.length === 0) redirect('/'); // 닫힌 서버에도 없다 — 신규. 레이아웃이 만든다.

  const servers = await listServersForUser(userId);
  const closed = servers.filter((s) => closedIds.includes(s.id) && s.my);
  // 새로 시작할 서버 — 확인 화면에서 고른 서버(?to=, open만)가 있으면 그것, 아니면 추천 서버.
  const { to } = await searchParams;
  const n = Number(to);
  const asked = Number.isInteger(n) ? servers.find((s) => s.id === n && s.status === 'open') : undefined;
  const recommended = await recommendedServerId();
  const target = asked ?? servers.find((s) => s.id === recommended && s.status === 'open') ?? null;
  const names = closed.map((s) => s.name).join('·');
  const head = closed[0]!;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[390px] flex-col justify-center gap-6 px-7 py-12">
      <div className="flex flex-col gap-2.5">
        <h1 className="text-[22px] font-bold leading-snug text-zinc-900 dark:text-zinc-50">
          {names}
          {eun(names)} 운영을
          <br />
          종료했어요
        </h1>
        <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          <b className="text-zinc-700 dark:text-zinc-200">{head.my!.nickname}</b>
          {ro(head.my!.nickname)} 하던 기록은 더는 들어갈 수 없어요.
          {target ? (
            <>
              <br />
              {target.name}에서 처음부터 시작할 수 있어요.
            </>
          ) : null}
        </p>
      </div>

      {target ? (
        <NewCharacterChoice serverId={target.id} serverName={target.name} mine={[]} />
      ) : (
        <p role="alert" className="text-[13px] font-semibold text-red-600 dark:text-red-400">
          지금은 시작할 수 있는 서버가 없어요. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      <a
        href="/auth/signout"
        className="text-center text-[13px] font-semibold text-zinc-400 underline-offset-2 hover:underline"
      >
        로그아웃
      </a>
    </main>
  );
}
