'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { isAppSession, isStandaloneDisplay, isTwaClient } from '@/lib/platform-client';

/**
 * 심사용 로그인 진입로 — **앱(TWA)에서만** 보인다.
 *
 * 서버는 쿠키(`ig_platform`)로 1차만 거른다. 쿠키는 앱과 크롬이 저장소를 공유해 같은 기기의
 * 브라우저 탭에도 남으므로, 그것만 믿으면 웹에서도 링크가 떴다(2026-09-11 프로덕션 실측).
 * 여기서 세션 표식이나 표시 모드까지 확인해 앱 문맥에서만 렌더한다. 첫 페인트에는 숨긴 상태라
 * 웹에서 잠깐 비치는 일도 없다.
 */
export function ReviewerEntry() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(isAppSession() || (isTwaClient() && isStandaloneDisplay()));
  }, []);
  if (!show) return null;
  return (
    <Link
      href="/login?test=true"
      className="mt-6 block w-full text-center text-[10px] text-zinc-600 underline-offset-2 hover:underline"
    >
      심사용 로그인 · Reviewer sign-in
    </Link>
  );
}
