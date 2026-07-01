import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { PublicFooter } from '@/components/PublicFooter';

import { signInWithKakao, signInWithTestAccount, signInWithCredentials } from '@/lib/auth/actions';
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
  // 심사용 ID/PW 로그인 — ?test=true + env 둘 다 켜져야 노출(일반 사용자에겐 이메일 폼 숨김).
  const reviewLogin = test === 'true' && isTestLoginEnabled();

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex w-full max-w-[360px] flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
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
            {/* 카카오 로그인 버튼 — 공식 가이드 준수: 컨테이너 #FEE500 / 라벨 "카카오 로그인" /
                심볼·텍스트 #000(85%) / radius 12px. 심볼은 공식 말풍선(미변형). */}
            <button
              type="submit"
              aria-label="카카오 로그인"
              className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#FEE500] py-3.5 transition active:scale-[0.99] hover:brightness-95"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/kakao/kakao_symbol.png" alt="" aria-hidden className="h-[18px] w-auto" />
              <span className="text-[15px] font-bold text-black/85">카카오 로그인</span>
            </button>
          </form>
        )}

        {/* 심사용 ID/PW 로그인 — 포트원·게임위 심사관이 카카오 없이 로그인. env로만 노출/차단. */}
        {reviewLogin ? (
          <form action={signInWithCredentials} className="w-full space-y-2 text-left">
            <input
              type="email"
              name="email"
              autoComplete="username"
              placeholder="아이디(이메일)"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="비밀번호"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              className="block w-full rounded-xl bg-zinc-800 py-3 text-sm font-bold text-white transition active:scale-[0.99] hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white"
            >
              로그인
            </button>
          </form>
        ) : null}

        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            로그인 실패: {decodeURIComponent(error)}
          </p>
        ) : null}
        <p className="text-[11px] leading-relaxed text-zinc-400">
          로그인 시{' '}
          <Link href="/legal/terms" className="underline">
            이용약관
          </Link>{' '}
          및{' '}
          <Link href="/legal/privacy" className="underline">
            개인정보처리방침
          </Link>
          에 동의하는 것으로 간주됩니다.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}
