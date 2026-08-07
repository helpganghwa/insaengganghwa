'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * 다이아 잔액의 클라이언트 측 낙관 갱신 컨텍스트.
 * - 헤더 다이아 표시(HeaderDiamond)·상점이 값을 구독.
 * - 보석 시간 단축 등 클라이언트 액션이 optimisticAdjust(-cost)로 즉시 차감 표시.
 * - 서버 응답 + router.refresh() 후 layoutData가 새로 들어오면 prop sync로 정확값 복귀.
 *
 * 값/액션 2분할(2026-08-07 렌더 감사) — 구독 13곳 중 11곳이 optimisticAdjust만 쓰는데
 * 단일 컨텍스트라 다이아 1 변동에도 지도(1,716줄)·배치보드·우편 등 무거운 트리가 전부
 * 리렌더됐다. 액션 컨텍스트는 useMemo([])로 영구 불변 — 액션만 쓰는 구독자는 리렌더 0.
 */
type DiamondActions = {
  optimisticAdjust: (delta: bigint) => void;
  /** Suspense 안에서 서버 값이 도착하면 base를 sync — DiamondInitializer가 호출. */
  setBase: (next: bigint) => void;
};

const DiamondValueContext = createContext<bigint | null>(null);
const DiamondActionsContext = createContext<DiamondActions | null>(null);

export function DiamondProvider({
  initial = 0n,
  children,
}: {
  initial?: bigint;
  children: ReactNode;
}) {
  const [diamond, setDiamond] = useState<bigint>(initial);
  // 함수형 업데이트만 사용 — state를 캡처하지 않아 마운트 후 영구 안정.
  const actions = useMemo<DiamondActions>(
    () => ({
      optimisticAdjust: (delta) => setDiamond((d) => d + delta),
      setBase: (next) => setDiamond(next),
    }),
    [],
  );
  return (
    <DiamondActionsContext.Provider value={actions}>
      <DiamondValueContext.Provider value={diamond}>{children}</DiamondValueContext.Provider>
    </DiamondActionsContext.Provider>
  );
}

/** 잔액 값 구독 — 다이아 변동마다 리렌더되므로 표시 리프(헤더·상점)에서만 사용. */
export function useDiamondValue(): bigint {
  return useContext(DiamondValueContext) ?? 0n;
}

/** 액션만 — 영구 안정 참조(다이아 변동에 리렌더 안 됨). 컨텍스트 밖에선 no-op 폴백. */
const NOOP_ACTIONS: DiamondActions = { optimisticAdjust: () => {}, setBase: () => {} };
export function useDiamondActions(): DiamondActions {
  return useContext(DiamondActionsContext) ?? NOOP_ACTIONS;
}

/**
 * AppHeader async 안에서 호출 — Suspense unwrap 후 서버 값을 context base로 sync.
 * useEffect로 마운트/diamond prop 변경 시 setBase. 출력은 null.
 */
export function DiamondInitializer({ diamond }: { diamond: bigint }) {
  const { setBase } = useDiamondActions();
  useEffect(() => {
    setBase(diamond);
    // setBase는 stable 함수 — deps에 안 넣어도 됨(eslint disable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diamond]);
  return null;
}
