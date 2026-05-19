import Link from 'next/link';
import { redirect } from 'next/navigation';

import { signInWithKakao } from '@/lib/auth/actions';
import { getSessionUserId } from '@/lib/auth/session';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSessionUserId()) redirect('/'); // 로컬 JWT 검증 (CLAUDE §11.1)
  const { error } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-black">
      <main className="flex w-full max-w-[360px] flex-col items-center gap-8 text-center">
        <div>
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-900 text-4xl dark:bg-zinc-100">
            ⚒️
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">인생강화</h1>
        </div>

        <form action={signInWithKakao} className="w-full">
          <button
            type="submit"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#FEE500] text-sm font-medium text-[#181600] hover:brightness-95"
          >
            <span aria-hidden>💬</span>
            카카오로 시작하기
          </button>
        </form>

        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            로그인 실패: {decodeURIComponent(error)}
          </p>
        ) : null}

        <p className="text-xs leading-5 text-zinc-500">
          가입 시{' '}
          <Link href="/terms" className="underline">
            이용약관
          </Link>{' '}
          및{' '}
          <Link href="/privacy" className="underline">
            개인정보처리방침
          </Link>
          에 동의하는 것으로 간주됩니다.
        </p>
      </main>
    </div>
  );
}
