'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * 다이아 잔액의 클라이언트 측 낙관 갱신 컨텍스트.
 * - 헤더 다이아 표시(AppHeaderShell)가 이 context를 구독.
 * - 보석 시간 단축 등 클라이언트 액션이 optimisticAdjust(-cost)로 즉시 차감 표시.
 * - 서버 응답 + router.refresh() 후 layoutData가 새로 들어오면 prop sync로 정확값 복귀.
 *
 * Provider는 (game) layout에 들어가 모든 자식 페이지가 접근 가능.
 */
type DiamondCtx = {
  diamond: bigint;
  optimisticAdjust: (delta: bigint) => void;
  /** Suspense 안에서 서버 값이 도착하면 base를 sync — DiamondInitializer가 호출. */
  setBase: (next: bigint) => void;
};

const DiamondContext = createContext<DiamondCtx | null>(null);

/**
 * 다이아 컨텍스트 Provider — layout level에 적용.
 * - initial=0n으로 시작(layout이 콜드스타트 회피로 await하지 않음).
 * - AppHeader async가 dataPromise unwrap 후 DiamondInitializer로 setBase(서버 값).
 * - 강화 페이지 등에서 보석 단축 시 optimisticAdjust(-cost)로 즉시 차감.
 * - router.refresh() 후 새 서버 값이 setBase로 들어오면 정확값 복귀.
 */
export function DiamondProvider({
  initial = 0n,
  children,
}: {
  initial?: bigint;
  children: ReactNode;
}) {
  const [diamond, setDiamond] = useState<bigint>(initial);
  const optimisticAdjust = (delta: bigint) => setDiamond((d) => d + delta);
  const setBase = (next: bigint) => setDiamond(next);
  return (
    <DiamondContext.Provider value={{ diamond, optimisticAdjust, setBase }}>
      {children}
    </DiamondContext.Provider>
  );
}

/** 컨텍스트 외 사용 시 안전 fallback — diamond=0n, adjust=no-op. */
export function useDiamond(): DiamondCtx {
  const ctx = useContext(DiamondContext);
  if (!ctx) return { diamond: 0n, optimisticAdjust: () => {}, setBase: () => {} };
  return ctx;
}

/**
 * AppHeader async 안에서 호출 — Suspense unwrap 후 서버 값을 context base로 sync.
 * useEffect로 마운트/diamond prop 변경 시 setBase. 출력은 null.
 */
export function DiamondInitializer({ diamond }: { diamond: bigint }) {
  const { setBase } = useDiamond();
  useEffect(() => {
    setBase(diamond);
    // setBase는 stable 함수 — deps에 안 넣어도 됨(eslint disable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diamond]);
  return null;
}
