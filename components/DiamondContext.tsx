'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

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
  /** 클릭 시점 잔액 읽기(구독 없음) — 다이아 게이트(부족 팝업) 사전 체크용. 값 구독과 달리
      리렌더를 유발하지 않으므로 무거운 컴포넌트에서 안전(2026-08-22 결제 유도 개편).
      **null = 서버 잔액 미주입**(AppHeader Suspense가 setBase하기 전) — 이 창에서 0으로
      오탐하면 충분한 유저에게 부족 팝업이 뜬다(적대 검수). 호출측은 null이면 체크를 건너뛰고
      서버 판정에 맡긴다. ⚠ 같은 핸들러에서 optimisticAdjust 직후 get()은 배칭 전 값일 수
      있음 — ensure를 차감보다 먼저 부를 것(현 호출부 전부 준수). */
  get: () => bigint | null;
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
  // get()용 미러 — updater 안에서 동기 갱신(StrictMode 중복 호출에도 결정론이라 안전).
  // init=false 동안 get()은 null(서버 잔액 미주입 — setBase가 처음 켠다).
  const ref = useRef<{ v: bigint; init: boolean }>({ v: initial, init: false });
  // 함수형 업데이트만 사용 — state를 캡처하지 않아 마운트 후 영구 안정.
  const actions = useMemo<DiamondActions>(
    () => ({
      optimisticAdjust: (delta) =>
        setDiamond((d) => {
          ref.current = { v: d + delta, init: ref.current.init };
          return d + delta;
        }),
      setBase: (next) =>
        setDiamond(() => {
          ref.current = { v: next, init: true };
          return next;
        }),
      get: () => (ref.current.init ? ref.current.v : null),
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
const NOOP_ACTIONS: DiamondActions = { optimisticAdjust: () => {}, setBase: () => {}, get: () => null };
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
