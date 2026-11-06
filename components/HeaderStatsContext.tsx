'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import {
  addEnhanceDelta,
  MAX_PENDING_DELTAS,
  reconcileHeaderBase,
  releaseDotOverride,
  type EnhanceDelta,
  type EnhanceDotOverride,
  type HeaderStats,
  type PendingDelta,
} from '@/lib/client/header-stats-reconcile';

/**
 * 헤더 서브라인(전투력·최고강화·합산강화)의 클라이언트 낙관 갱신 컨텍스트 — DiamondContext 패턴.
 *
 * 자동 강화는 스텝마다 layout 재렌더(revalidate)를 하지 않아(§11.7 고빈도 액션 부하) 헤더
 * 스탯이 세션 끝까지 멈춰 보였다. 스텝 응답의 레벨 변화(from→to)와 아이템 초월 수치만으로
 * 서버와 동일한 순수 공식(pieceCombatPower)을 클라에서 적용 — 추가 서버 왕복 0으로 실시간.
 *  - combat += P(to,t) − P(from,t) / sum += to−from / max = max(max, to) (max_enhance_level은 단조 증가)
 * 세션 종료 refresh·다른 액션의 재렌더 시 layout의 서버 권위값이 setBase로 재동기(드리프트 교정).
 * 수동 강화 수령도 2026-11-06(업데이트 18)부터 재렌더 없이 같은 델타로 반영한다.
 *
 * 값/액션 2분할(2026-08-07 렌더 감사) — 이전엔 자동강화 스텝마다 applyEnhanceDelta 호출이
 * 새 value 객체를 만들어 **강화 카드 6개가 자기 델타로 자기를 리렌더**하는 루프였다.
 * 카드가 쓰는 건 액션뿐 — 액션 컨텍스트는 영구 불변이라 이 루프가 사라진다.
 */
export type { HeaderStats } from '@/lib/client/header-stats-reconcile';

type HeaderStatsActions = {
  /** 셸(layout) 서버값 — asOfMs는 그 값을 읽은 문장의 DB 시작 시각(없으면 null). */
  setBase: (next: HeaderStats | null, asOfMs?: number | null) => void;
  /**
   * 강화 결과 1건 반영 — 서버와 동일 공식의 정확 델타(표시 전용, 권위는 서버).
   * seenAtMs(수동 수령, 2026-11-06 업데이트 18): 정산 커밋 뒤 DB 시각. 넘기면 셸 값이 아직 없거나(null) 나중에 도착한 셸 값이
   * 이 시각보다 먼저 읽힌 것이면 델타를 다시 얹고 한 번 새로 받아(router.refresh) 낡은 값으로 끝나지 않게 한다.
   * null = 시각을 모름 → 곧바로 한 번 새로 받는다(종전 revalidatePath 재렌더와 같은 결과). 생략(자동 강화) = 종전 동작.
   */
  applyEnhanceDelta: (d: EnhanceDelta, seenAtMs?: number | null) => void;
  /**
   * 하단 네비 강화 완료 점 덮어쓰기(2026-11-06 업데이트 18) — 수동 수령이 페이지 재렌더 없이 서버가 돌려준 값
   * (enhanceReady)으로 점을 맞춘다. null = 덮어쓰기 해제(셸 값 사용). seenAtMs = 그 값을 읽은 DB 시각.
   */
  setEnhanceDot: (v: boolean | null, seenAtMs?: number | null) => void;
  /**
   * 새 셸 렌더 도착 — 셸 점이 덮어쓴 값보다 나중에 읽혔을 때만 덮어쓰기를 해제한다. 수령 전에 읽힌 셸 렌더가 늦게
   * 도착하면(asOf < seenAt) 덮어쓴 값을 유지해 틀린 점으로 돌아가지 않는다. asOf를 모르면(셸 실패 기본값) 유지.
   */
  releaseEnhanceDot: (shellAsOfMs: number | null) => void;
};

type DotOverride = EnhanceDotOverride;

const ValueCtx = createContext<HeaderStats | null>(null);
const ActionsCtx = createContext<HeaderStatsActions | null>(null);
const EnhanceDotCtx = createContext<DotOverride | null>(null);

export function HeaderStatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<HeaderStats | null>(null);
  const [enhanceDot, setEnhanceDot] = useState<DotOverride | null>(null);
  const router = useRouter();
  /**
   * 셸 값과 선후를 아직 확정하지 못한 수동 수령 델타(2026-11-06 업데이트 18). 셸 값(asOf)이 seenAt 이후에 읽혔으면 이미
   * 들어 있으니 버리고, 아니면(또는 asOf를 모르면) 셸 값 위에 다시 얹은 채 한 번 새로 받는다 — 새 렌더는 정산 뒤라 지워진다.
   * refreshed: 이 델타 때문에 이미 새로 받기를 요청했는가(셸이 실패해도 무한 refresh 하지 않게).
   */
  const pendingRef = useRef<PendingDelta[]>([]);
  // 함수형 업데이트만 사용 — 영구 안정(router는 앱 라우터에서 안정 객체).
  const actions = useMemo<HeaderStatsActions>(
    () => ({
      setBase: (next, asOfMs) => {
        // 셸 값이 수령 커밋 뒤에 읽혔으면 그 델타는 버리고, 먼저 읽혔을 수 있으면 다시 얹고 한 번 새로 받는다.
        const r = reconcileHeaderBase(next, asOfMs ?? null, pendingRef.current);
        pendingRef.current = r.pending;
        setStats(r.stats);
        if (r.refresh) router.refresh();
      },
      applyEnhanceDelta: (d, seenAtMs) => {
        if (seenAtMs === undefined) {
          // 자동 강화 스텝(종전 동작) — base 미도착이면 다음 서버값이 이미 반영된 상태로 도착.
          setStats((s) => (s ? addEnhanceDelta(s, d) : s));
          return;
        }
        if (seenAtMs === null) {
          // 커밋 시각을 모른다 — 지금 값에 얹고 곧바로 한 번 새로 받는다(새 렌더는 정산 뒤라 정확).
          setStats((s) => (s ? addEnhanceDelta(s, d) : s));
          router.refresh();
          return;
        }
        const list = pendingRef.current;
        list.push({ seenAtMs, d, refreshed: false });
        if (list.length > MAX_PENDING_DELTAS) list.splice(0, list.length - MAX_PENDING_DELTAS);
        // 셸 값이 아직 없으면(null) 그대로 둔다 — 도착하는 setBase가 asOf로 판정해 얹거나 버린다.
        setStats((s) => (s ? addEnhanceDelta(s, d) : s));
      },
      setEnhanceDot: (v, seenAtMs) => setEnhanceDot(v == null ? null : { value: v, seenAtMs: seenAtMs ?? null }),
      releaseEnhanceDot: (shellAsOfMs) => setEnhanceDot((o) => releaseDotOverride(o, shellAsOfMs)),
    }),
    [router],
  );
  return (
    <ActionsCtx.Provider value={actions}>
      <EnhanceDotCtx.Provider value={enhanceDot}>
        <ValueCtx.Provider value={stats}>{children}</ValueCtx.Provider>
      </EnhanceDotCtx.Provider>
    </ActionsCtx.Provider>
  );
}

/** 강화 완료 점 덮어쓰기 값 — null이면 셸(layout) 값을 쓴다. */
export function useEnhanceDotOverride(): boolean | null {
  return useContext(EnhanceDotCtx)?.value ?? null;
}

/** 액션만 — 영구 안정(스탯 변동에 리렌더 안 됨). Provider 밖에선 no-op(비게임 레이아웃 안전). */
const NOOP_ACTIONS: HeaderStatsActions = {
  setBase: () => {},
  applyEnhanceDelta: () => {},
  setEnhanceDot: () => {},
  releaseEnhanceDot: () => {},
};
export function useHeaderStatsActions(): HeaderStatsActions {
  return useContext(ActionsCtx) ?? NOOP_ACTIONS;
}

/** layout 서버값 도착 시 base 동기화 — DiamondInitializer와 동일 패턴. */
export function HeaderStatsInitializer({ stats, asOfMs = null }: { stats: HeaderStats | null; asOfMs?: number | null }) {
  const { setBase } = useHeaderStatsActions();
  useEffect(() => {
    setBase(stats, asOfMs);
    // asOfMs 포함(2026-11-06 업데이트 18) — 같은 값이라도 새 셸 렌더면 대기 중인 수령 델타를 정리해야 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats?.combat, stats?.maxEnhance, stats?.sumEnhance, asOfMs]);
  return null;
}

/** 헤더 서브라인 표시(client) — 값 구독은 이 리프뿐. AppHeaderShell의 정적 서브라인과 동일 마크업. */
export function HeaderStatsLine() {
  const stats = useContext(ValueCtx);
  if (!stats) return null;
  return (
    <span className="truncate font-mono text-[9px] font-bold text-zinc-500 dark:text-zinc-400">
      전투력{' '}
      <b className="font-extrabold text-amber-600 dark:text-amber-300">
        {stats.combat.toLocaleString('ko-KR')}
      </b>
      {' · '}최고{' '}
      <b className="font-extrabold text-amber-600 dark:text-amber-300">+{stats.maxEnhance}</b>
      {' · '}합산{' '}
      <b className="font-extrabold text-amber-600 dark:text-amber-300">+{stats.sumEnhance}</b>
    </span>
  );
}
