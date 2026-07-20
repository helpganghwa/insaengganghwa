import Link from 'next/link';

/** 404 — 없는 경로 진입 시 흰 화면 대신 홈으로 안내(2026-05-29). */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-2xl font-bold tracking-tight text-zinc-100">404</p>
      <p className="text-sm text-zinc-400">페이지를 찾을 수 없어요.</p>
      <Link prefetch={false}
        href="/"
        className="rounded-full bg-zinc-100 px-5 py-2 text-sm font-medium text-zinc-900 active:scale-95"
      >
        홈으로
      </Link>
    </div>
  );
}
