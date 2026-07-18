import type { Metadata } from 'next';
import { Suspense } from 'react';

import { GoClient } from './GoClient';

/**
 * 광고 랜딩 게이트(/go) — 인스타·페북·카톡 인앱 브라우저 탈출 유도(G123 패턴, 2026-07-18).
 * 일반 브라우저면 /login으로 즉시 이동(UTM 등 쿼리 보존), 인앱이면 외부 브라우저 열기 안내.
 * 광고 전용 진입점이라 검색 인덱싱 제외.
 */
export const metadata: Metadata = {
  title: '인생강화 시작하기',
  robots: { index: false, follow: false },
};

export default function GoPage() {
  return (
    <Suspense fallback={null}>
      <GoClient />
    </Suspense>
  );
}
