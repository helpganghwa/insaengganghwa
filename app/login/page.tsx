import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { signInWithKakao, signInWithTestAccount } from '@/lib/auth/actions';
import { getSessionUserId } from '@/lib/auth/session';
import { isTestLoginEnabled, TEST_ACCOUNTS } from '@/lib/auth/test-accounts';
import { listServersPublic, latestOpenServerId } from '@/lib/game/server-select';
import { ServerPicker } from './ServerPicker';

/** 로그인 화면 서버 기본 선택 — 공유된 서버 > 직전 접속 서버(srv 잔존) > 최신 open 서버. */
async function defaultServerId(open: { id: number; status: string }[]): Promise<number> {
  const jar = await cookies();
  const cand = [Number(jar.get('pending_server')?.value), Number(jar.get('srv')?.value)];
  for (const c of cand) {
    if (Number.isInteger(c) && open.some((s) => s.id === c && s.status === 'open')) return c;
  }
  return latestOpenServerId();
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; test?: string }>;
}) {
  if (await getSessionUserId()) redirect('/'); // 로컬 JWT 검증 (CLAUDE §11.1)
  const { error, test } = await searchParams;
  // 서버 선택(SERVER.md §3) — 접속 가능한 서버가 1개라도 있으면 셀렉터 노출(0개일 때만 숨김).
  // 변경은 로그아웃 후 여기서.
  const servers = await listServersPublic().catch(() => [] as { id: number; name: string; status: string }[]);
  const showServers = servers.length >= 1;
  const defaultSrv = showServers ? await defaultServerId(servers) : 1;
  const recommendedId = showServers ? await latestOpenServerId() : 1;
  // 테스트 로그인 — /login?test=true + env 스위치 둘 다 켜져야 노출(실운영 전환 시 env로 차단).
  const testMode = test === 'true' && isTestLoginEnabled();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <main className="flex w-full max-w-[360px] flex-col items-center gap-8 text-center">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt="인생강화"
            className="mx-auto h-20 w-20 rounded-2xl shadow-sm"
            style={{ imageRendering: 'pixelated' }}
          />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">인생강화</h1>
        </div>

        {showServers && <ServerPicker servers={servers} defaultSrv={defaultSrv} recommendedId={recommendedId} />}

        {testMode ? (
          <div className="w-full space-y-2">
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              🧪 테스트 로그인 (실운영 전 제거 예정)
            </p>
            {TEST_ACCOUNTS.map((a) => (
              <form action={signInWithTestAccount} key={a.email} className="w-full">
                <input type="hidden" name="email" value={a.email} />
                <button
                  type="submit"
                  className="block w-full rounded-xl border border-zinc-300 bg-white py-3 text-sm font-bold text-zinc-800 transition active:scale-[0.99] hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  {a.label}(으)로 로그인
                </button>
              </form>
            ))}
          </div>
        ) : (
          <form action={signInWithKakao} className="w-full">
            {/* 카카오 공식 디자인 가이드 버튼(complete/ko) — 변형 금지(색·로고·비율 유지). */}
            <button
              type="submit"
              aria-label="카카오로 시작하기"
              className="block w-full transition active:scale-[0.99] hover:brightness-95"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/kakao/kakao_login.png" alt="카카오로 시작하기" className="block w-full" />
            </button>
          </form>
        )}

        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            로그인 실패: {decodeURIComponent(error)}
          </p>
        ) : null}
        {/* TODO(출시 전): 정식 이용약관·개인정보처리방침 페이지(/terms·/privacy) 작성 후
            "가입 시 …에 동의 간주" 고지 + 링크 복원. 링크가 404라 임시 제거(2026-05-29). */}
      </main>
    </div>
  );
}
