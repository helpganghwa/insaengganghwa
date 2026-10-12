'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

// SSR에서는 useLayoutEffect가 돌지 않으므로 useEffect로 대체(경고 회피). 클라에서는 항상 layout.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * '최신 값 ref' — 렌더마다 바뀌는 콜백·값을 effect deps 없이 핸들러/effect 정리에서 최신으로 읽기 위한 ref.
 * 종전엔 `ref.current = value`를 **렌더 중**에 써서 React Compiler가 그 컴포넌트를 통째로 건너뛰었다(코드 품질 조사 10-12).
 * 여기서는 **페인트 전**(useLayoutEffect)에 갱신한다 — 렌더가 끝나면 사용자 이벤트가 끼어들기 전에 최신 값이 들어 있으므로
 * 동작·타이밍은 종전과 같다.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useIsoLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
