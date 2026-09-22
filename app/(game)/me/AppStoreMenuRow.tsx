'use client';

import { useEffect, useState } from 'react';

import { PLAY_APP_ID, PLAY_STORE_URL, openPlayApp } from '@/components/install/useAppInstall';
import { isAppSession } from '@/lib/platform-client';

type Row = 'hidden' | 'install' | 'open';

/**
 * 프로필 메뉴 — 안드로이드 웹·PWA 유저에게 Play 앱을 권한다(2026-09-22, 사용자 제안).
 *
 * - 앱 세션(TWA)·iOS·데스크톱에는 안 보인다. PWA로 쓰는 유저는 대상이다 — PWA와 앱은 크롬 저장소를
 *   공유해 로그인이 유지된다.
 * - Play 앱이 이미 깔려 있으면(크롬 설치 앱 조회) "앱에서 열기"로 바뀐다. 조회가 안 되는 브라우저는
 *   설치 행을 보여 준다(스토어 페이지가 설치 여부를 알아서 보여 준다).
 * - 첫 페인트에는 숨긴다(하이드레이션 안전, 웹에서 잠깐 비치지 않게).
 */
export function AppStoreMenuRow({ forceShow = false }: { /** 스테이징 확인용 — OS·앱 세션과 무관하게 보인다(프로덕션은 false). */ forceShow?: boolean }) {
  const [row, setRow] = useState<Row>('hidden');
  useEffect(() => {
    if (!forceShow) {
      if (isAppSession()) return;
      if (!/Android/.test(window.navigator.userAgent)) return;
    }
    let alive = true;
    const related = (navigator as { getInstalledRelatedApps?: () => Promise<{ id?: string; platform: string }[]> })
      .getInstalledRelatedApps;
    if (typeof related !== 'function') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 후 1회 확정
      setRow('install');
      return;
    }
    related
      .call(navigator)
      .then((apps) => {
        if (!alive) return;
        setRow(apps.some((a) => a.platform === 'play' && a.id === PLAY_APP_ID) ? 'open' : 'install');
      })
      .catch(() => {
        if (alive) setRow('install');
      });
    return () => {
      alive = false;
    };
  }, [forceShow]);
  if (row === 'hidden') return null;

  const cls =
    'flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left dark:border-zinc-800 dark:bg-zinc-950';
  if (row === 'open') {
    return (
      <button type="button" onClick={openPlayApp} className={cls}>
        <span className="flex items-center gap-3">
          <span aria-hidden className="text-xl">
            📱
          </span>
          <span className="text-sm font-medium">앱에서 열기</span>
        </span>
        <span className="shrink-0 text-[11.5px] text-zinc-400">Play 앱 설치됨</span>
      </button>
    );
  }
  return (
    <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className={cls}>
      <span className="flex items-center gap-3">
        <span aria-hidden className="text-xl">
          📱
        </span>
        <span className="text-sm font-medium">앱으로 설치하기</span>
      </span>
      <span className="shrink-0 text-[11.5px] text-zinc-400">Google Play</span>
    </a>
  );
}
