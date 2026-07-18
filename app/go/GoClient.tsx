'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * /go 게이트 클라이언트 — UA로 인앱 브라우저 판별(광고 랜딩).
 *  - 일반 브라우저: /login으로 즉시 replace(쿼리 보존 — UTM 유실 방지)
 *  - 인앱: 전부 사용자 행동 기반 탈출(자동 스킴 발사 금지 — 웹뷰 차단·광고 심사 리스크)
 *    · 카카오톡: openExternal 스킴 버튼 · 안드로이드: intent Chrome 버튼 · iOS: ··· 안내+URL 복사
 *  - 디자인은 /login과 동일 언어(#17110c·히어로 아트·앰버) — 광고에서 넘어온 첫 화면이 곧 게임 첫인상.
 */

type Env = 'checking' | 'normal' | 'ios-inapp' | 'android-inapp' | 'kakao';

const INAPP_RE = /Instagram|FBAN|FBAV|FB_IAB|KAKAOTALK|NAVER\(inApp|DaumApps|Line\/|TikTok|BytedanceWebview|Threads/i;

export function GoClient() {
  const params = useSearchParams();
  const [env, setEnv] = useState<Env>('checking');
  const [copied, setCopied] = useState(false);

  const search = params.toString();
  const target = `https://ganghwa.app/login${search ? `?${search}` : ''}`;

  useEffect(() => {
    const ua = navigator.userAgent;
    if (!INAPP_RE.test(ua)) {
      setEnv('normal');
      window.location.replace(`/login${search ? `?${search}` : ''}`);
      return;
    }
    if (/KAKAOTALK/i.test(ua)) {
      setEnv('kakao');
      return;
    }
    setEnv(/Android/i.test(ua) ? 'android-inapp' : 'ios-inapp');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openChrome = () => {
    const noScheme = target.replace(/^https?:\/\//, '');
    window.location.href = `intent://${noScheme}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(target)};end`;
  };
  const openKakaoExternal = () => {
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(target)}`;
  };
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(target);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('아래 주소를 길게 눌러 복사하세요', target);
    }
  };

  if (env === 'checking' || env === 'normal') {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col items-center justify-center gap-3 bg-[#17110c] px-6 text-zinc-200">
        <div className="animate-pulse text-4xl">⚒️</div>
        <p className="text-[14px] font-bold">인생강화로 이동 중...</p>
        <a href={target} className="text-[13px] text-zinc-500 underline">
          자동으로 이동하지 않으면 여기를 누르세요
        </a>
      </main>
    );
  }

  const primaryBtn =
    'w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3.5 text-[15px] font-extrabold text-amber-950 shadow-[0_0_24px_rgba(245,158,11,0.25)] transition active:scale-[0.99]';

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[390px] bg-[#17110c] pb-10 text-zinc-200">
      {/* 히어로 — 로그인과 동일한 타이틀 아트(하단 #17110c 페이드 베이킹) */}
      <div
        role="img"
        aria-label="인생강화 — 강화는 인생이다"
        className="aspect-[1344/768] w-full bg-[#17110c] bg-cover bg-top"
        style={{ backgroundImage: 'url(/login-hero.webp)' }}
      />

      <div className="px-5">
        <h1 className="text-center text-[18px] font-extrabold leading-relaxed">
          인생강화는 <span className="text-amber-400">웹게임</span>이에요
        </h1>
        <p className="mt-1 text-center text-[13px] leading-relaxed text-zinc-400">
          원활한 플레이를 위해 평소 쓰시는 브라우저로 열어주세요
        </p>

        <section className="mt-5 rounded-2xl bg-zinc-900/80 p-5 ring-1 ring-amber-700/40">
          <h2 className="text-[15px] font-extrabold text-zinc-100">
            <span className="mr-1.5 rounded-md bg-amber-500 px-1.5 py-0.5 text-[11px] font-bold text-amber-950">추천</span>
            외부 브라우저로 열기
          </h2>

          {env === 'kakao' ? (
            <button type="button" onClick={openKakaoExternal} className={`mt-4 ${primaryBtn}`}>
              기본 브라우저로 열기 →
            </button>
          ) : env === 'android-inapp' ? (
            <button type="button" onClick={openChrome} className={`mt-4 ${primaryBtn}`}>
              Chrome으로 바로 열기 →
            </button>
          ) : (
            <div className="mt-4 space-y-4">
              {/* 1단계 — 인앱 브라우저 상단 목업(··· 위치 안내) */}
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0 rounded-md bg-amber-500 px-2 py-0.5 text-[12px] font-extrabold text-amber-950">1</span>
                <p className="text-[14px] leading-relaxed">
                  오른쪽 상단의 <b className="rounded bg-zinc-800 px-1.5 text-amber-300">···</b> 버튼을 누르세요
                </p>
              </div>
              <div className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] text-zinc-500">✕</span>
                  <span className="text-[12px] text-zinc-400">🔒 ganghwa.app</span>
                  <span className="relative rounded-full bg-zinc-800 px-2 py-0.5 text-[15px] font-bold text-amber-300 ring-2 ring-amber-400">
                    ···
                  </span>
                </div>
              </div>
              {/* 2단계 — 메뉴 목업 */}
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0 rounded-md bg-amber-500 px-2 py-0.5 text-[12px] font-extrabold text-amber-950">2</span>
                <p className="text-[14px] leading-relaxed">
                  <b className="text-amber-300">외부 브라우저로 열기</b> 를 선택하세요
                </p>
              </div>
              <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-2">
                <div className="rounded-lg bg-zinc-800 px-3 py-2.5 text-center text-[14px] font-bold text-zinc-100 ring-1 ring-amber-400/60">
                  ↗ 외부 브라우저로 열기
                </div>
              </div>
            </div>
          )}

          <div className="my-5 flex items-center gap-3 text-[11px] text-zinc-500">
            <span className="h-px flex-1 bg-zinc-700/60" />
            잘 되지 않는 경우
            <span className="h-px flex-1 bg-zinc-700/60" />
          </div>

          <button
            type="button"
            onClick={copyUrl}
            className="w-full rounded-xl border border-zinc-600 bg-zinc-800/80 px-4 py-3 text-[14px] font-bold text-zinc-100 transition active:bg-zinc-700"
          >
            {copied ? '✅ 복사됐어요 — 브라우저에 붙여넣으세요' : '📋 주소를 복사해 브라우저에서 열기'}
          </button>
          <p className="mt-2 break-all text-center text-[11px] text-zinc-500">{target}</p>
        </section>

        {/* 게임 요약 칩 */}
        <div className="mt-5 flex justify-center gap-2 text-[11.5px] font-bold text-zinc-300">
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5">📱 설치 없음</span>
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5">🆓 무료 플레이</span>
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5">⚡ 카카오 3초 시작</span>
        </div>
        <p className="mt-3 text-center text-[12px] leading-relaxed text-zinc-500">
          기다릴수록 성공 확률이 오르는 방치형 강화 RPG
        </p>
      </div>
    </main>
  );
}
