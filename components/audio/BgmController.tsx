'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { setTrack, unlock } from '@/lib/audio/bgm';
import { trackForPath } from '@/lib/audio/bgm-map';

/**
 * BGM 컨트롤러 — 마운트 전용(렌더 없음). 라우트가 바뀔 때마다 매핑된 트랙으로 크로스페이드.
 * 첫 사용자 제스처(pointerdown) 전엔 자동재생이 차단되므로, 1회 제스처로 unlock한다.
 * 토글이 꺼져 있으면 매니저가 내부적으로 재생을 시작하지 않는다.
 */
export function BgmController() {
  const pathname = usePathname();

  useEffect(() => {
    setTrack(trackForPath(pathname));
  }, [pathname]);

  useEffect(() => {
    const onGesture = () => unlock();
    window.addEventListener('pointerdown', onGesture, { once: true });
    return () => window.removeEventListener('pointerdown', onGesture);
  }, []);

  return null;
}
