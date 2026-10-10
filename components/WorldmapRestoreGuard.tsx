'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * 세계지도 구역·길드 팝업 복원 키 정리(2026-10-10 사용자: 팝업을 열어 둔 채 홈으로 갔다가 다시 지도를 열면 팝업이 저절로 열렸다).
 * 복원 키(ig:worldmap-restore·-guild)는 지도에서 전투 기록·프로필로 잠깐 다녀올 때만 쓰는 것이라, 그 경로 밖의 화면에 들어오면 지운다.
 * 지도(/guild/map)·배치 탭(/guild/deploy)은 키를 소비하는 쪽이고, 전투 기록(/guild/battle)·프로필(/u)은 다녀오는 쪽이라 남겨 둔다.
 */
const KEEP = ['/guild/map', '/guild/deploy', '/guild/battle/', '/u/'];

export function WorldmapRestoreGuard() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || KEEP.some((p) => pathname.startsWith(p))) return;
    try {
      sessionStorage.removeItem('ig:worldmap-restore');
      sessionStorage.removeItem('ig:worldmap-restore-guild');
    } catch {
      // sessionStorage 불가 — 정리만 생략
    }
  }, [pathname]);
  return null;
}
