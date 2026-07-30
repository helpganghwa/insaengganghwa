'use client';

import { useLayoutEffect } from 'react';

/**
 * 진입 시 앱 스크롤 컨테이너를 맨 위로(2026-07-30 제보).
 *
 * 앱 셸은 `fixed inset-0` 안의 `<main class="overflow-y-auto">`가 스크롤 컨테이너다.
 * 라우터의 기본 스크롤 처리는 이 중첩 컨테이너를 항상 되돌려 주지는 않아서, 앞 화면을
 * 내려 본 상태로 들어오면 새 화면도 내려간 채 열린다. 지도처럼 **첫 화면이 곧 내용**인
 * 곳에서 특히 눈에 띈다.
 *
 * 그리기 전에 되돌려 화면이 튀지 않도록 layout effect를 쓴다.
 */
export function ScrollTopOnMount() {
  useLayoutEffect(() => {
    document.querySelector('main')?.scrollTo(0, 0);
  }, []);
  return null;
}
