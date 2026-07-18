'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * /go 게이트 클라이언트 — UA로 인앱 브라우저 판별.
 *  - 일반 브라우저: /login으로 즉시 replace(쿼리 보존 — UTM 유실 방지)
 *  - 카카오톡: kakaotalk://web/openExternal 스킴으로 기본 브라우저 자동 열기
 *  - 안드로이드 인앱: intent:// 링크로 Chrome 열기 버튼
 *  - iOS 인앱(인스타/페북 등): ··· → 외부 브라우저로 열기 안내 + URL 복사 폴백
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
      // 카톡 인앱은 공식 스킴으로 기본 브라우저 자동 이동
      window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(target)}`;
      return;
    }
    setEnv(/Android/i.test(ua) ? 'android-inapp' : 'ios-inapp');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openChrome = () => {
    const noScheme = target.replace(/^https?:\/\//, '');
    window.location.href = `intent://${noScheme}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(target)};end`;
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

  if (env === 'checking' || env === 'normal' || env === 'kakao') {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col items-center justify-center gap-3 bg-white px-6 dark:bg-zinc-950">
        <div className="text-3xl">⚒️</div>
        <p className="text-[14px] font-bold text-zinc-700 dark:text-zinc-200">인생강화로 이동 중...</p>
        <a href={target} className="text-[13px] text-zinc-500 underline">
          자동으로 이동하지 않으면 여기를 누르세요
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[390px] bg-zinc-100 px-4 py-8 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      {/* 우상단 ··· 를 가리키는 화살표 느낌의 헤더 */}
      <header className="mb-6 text-center">
        <div className="mx-auto mb-3 inline-block rounded-2xl bg-zinc-900 px-4 py-2 text-[15px] font-extrabold text-amber-400 dark:bg-zinc-800">
          ⚒️ 인생강화
        </div>
        <h1 className="text-[17px] font-extrabold leading-relaxed">
          인생강화는 <span className="text-amber-600 dark:text-amber-400">웹게임</span>이에요
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          원활한 플레이를 위해
          <br />
          평소 쓰시는 브라우저로 열어주세요
        </p>
      </header>

      <section className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900">
        <h2 className="text-[15px] font-extrabold">
          <span className="mr-1 rounded-md bg-amber-500 px-1.5 py-0.5 text-[12px] text-white">추천</span>
          외부 브라우저로 열기
        </h2>

        {env === 'android-inapp' ? (
          <button
            type="button"
            onClick={openChrome}
            className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-3.5 text-[15px] font-extrabold text-white active:bg-amber-600"
          >
            Chrome으로 바로 열기
          </button>
        ) : (
          <ol className="mt-4 space-y-4">
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0 rounded-md bg-blue-500 px-2 py-0.5 text-[12px] font-bold text-white">1</span>
              <div className="text-[14px] leading-relaxed">
                오른쪽 상단의 <b className="rounded bg-zinc-100 px-1.5 dark:bg-zinc-800">···</b> 버튼을 누르세요
              </div>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0 rounded-md bg-blue-500 px-2 py-0.5 text-[12px] font-bold text-white">2</span>
              <div className="text-[14px] leading-relaxed">
                <b className="rounded bg-zinc-100 px-1.5 dark:bg-zinc-800">외부 브라우저로 열기</b> 를 선택하세요
              </div>
            </li>
          </ol>
        )}

        <div className="my-5 flex items-center gap-3 text-[12px] text-zinc-400">
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
          잘 되지 않는 경우
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
        </div>

        <button
          type="button"
          onClick={copyUrl}
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-[14px] font-bold text-zinc-800 active:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        >
          {copied ? '✅ 복사됐어요 — 브라우저에 붙여넣으세요' : '📋 주소를 복사해 브라우저에서 열기'}
        </button>
        <p className="mt-2 break-all text-center text-[12px] text-zinc-400">{target}</p>
      </section>

      <p className="mt-6 text-center text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        설치 없이 카카오 로그인으로 바로 시작하는
        <br />
        방치형 강화 RPG
      </p>
    </main>
  );
}
