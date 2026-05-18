import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';

/**
 * 루트 세션 게이트 (임시) — 비로그인 → /login, 로그인 → 확인 화면.
 * 정식 홈(WIREFRAMES §1)은 #10 셸 단계에서 (game) 라우트 그룹으로 교체 예정.
 */
export default async function RootPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');

  return (
    <main className="mx-auto flex min-h-dvh w-[390px] max-w-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="text-4xl">⚒️</div>
      <h1 className="text-2xl font-bold tracking-tight">인생강화</h1>
      <p className="text-sm text-emerald-600 dark:text-emerald-400">✅ 로그인 완료</p>
      <p className="text-xs text-zinc-400">홈 화면(WIREFRAMES §1)은 다음 단계에서 구현</p>
    </main>
  );
}
