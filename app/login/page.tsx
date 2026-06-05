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
