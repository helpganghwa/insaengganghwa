/**
 * 오프라인 폴백(2026-09-11 전수조사) — 앱(TWA)에는 주소창이 없어, 네트워크가 끊긴 채 열면
 * 크롬 기본 오류 페이지가 앱 전체를 차지한다. 브랜딩이 없어 "앱이 고장났다"로 읽힌다.
 * 서비스워커가 내비게이션 실패 시 이 화면을 대신 보여 준다(public/sw.js).
 */
export const dynamic = 'force-static';

export const metadata = { title: '연결 확인', robots: { index: false } };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-950 px-8 text-center">
      <p className="text-[34px]" aria-hidden>
        🔌
      </p>
      <h1 className="mt-3 text-[16px] font-extrabold text-zinc-100">인터넷 연결을 확인해 주세요</h1>
      <p className="mt-2 break-keep text-[12.5px] leading-relaxed text-zinc-400">
        모루는 그대로 있습니다. 연결이 돌아오면 하던 강화도 그대로 이어집니다.
      </p>
      {/* 서버 컴포넌트라 onClick을 못 쓴다 — 같은 주소로 다시 들어가는 링크가 곧 재시도다. */}
      <a
        href="/"
        className="mt-6 rounded-xl bg-amber-500 px-6 py-3 text-[14px] font-extrabold text-amber-950 active:scale-[0.99]"
      >
        다시 시도
      </a>
    </main>
  );
}
