'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { pieceCombatPower } from '@/lib/game/balance';

/**
 * 헤더 서브라인(전투력·최고강화·합산강화)의 클라이언트 낙관 갱신 컨텍스트 — DiamondContext 패턴.
 *
 * 자동 강화는 스텝마다 layout 재렌더(revalidate)를 하지 않아(§11.7 고빈도 액션 부하) 헤더
 * 스탯이 세션 끝까지 멈춰 보였다. 스텝 응답의 레벨 변화(from→to)와 아이템 초월 수치만으로
 * 서버와 동일한 순수 공식(pieceCombatPower)을 클라에서 적용 — 추가 서버 왕복 0으로 실시간.
 *  - combat += P(to,t) − P(from,t) / sum += to−from / max = max(max, to) (max_enhance_level은 단조 증가)
 * 수동 강화·세션 종료 refresh 시 layout의 서버 권위값이 setBase로 재동기(드리프트 교정).
 *
 * 값/액션 2분할(2026-08-07 렌더 감사) — 이전엔 자동강화 스텝마다 applyEnhanceDelta 호출이
 * 새 value 객체를 만들어 **강화 카드 6개가 자기 델타로 자기를 리렌더**하는 루프였다.
 * 카드가 쓰는 건 액션뿐 — 액션 컨텍스트는 영구 불변이라 이 루프가 사라진다.
 */
export type HeaderStats = { combat: number; maxEnhance: number; sumEnhance: number };

type HeaderStatsActions = {
  setBase: (next: HeaderStats | null) => void;
  /** 강화 결과 1건 반영 — 서버와 동일 공식의 정확 델타(표시 전용, 권위는 서버). */
  applyEnhanceDelta: (d: { fromLevel: number; toLevel: number; transcendLevel: number }) => void;
};

const ValueCtx = createContext<HeaderStats | null>(null);
const ActionsCtx = createContext<HeaderStatsActions | null>(null);

export function HeaderStatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<HeaderStats | null>(null);
  // 함수형 업데이트만 사용 — 영구 안정.
  const actions = useMemo<HeaderStatsActions>(
    () => ({
      setBase: (next) => setStats(next),
      applyEnhanceDelta: ({ fromLevel, toLevel, transcendLevel }) => {
        setStats((s) => {
          if (!s) return s; // base 미도착 — 다음 서버값이 이미 반영된 상태로 도착
          const combatDelta =
            pieceCombatPower(toLevel, transcendLevel) - pieceCombatPower(fromLevel, transcendLevel);
          return {
            combat: s.combat + combatDelta,
            maxEnhance: Math.max(s.maxEnhance, toLevel),
            sumEnhance: s.sumEnhance + (toLevel - fromLevel),
          };
        });
      },
    }),
    [],
  );
  return (
    <ActionsCtx.Provider value={actions}>
      <ValueCtx.Provider value={stats}>{children}</ValueCtx.Provider>
    </ActionsCtx.Provider>
  );
}

/** 액션만 — 영구 안정(스탯 변동에 리렌더 안 됨). Provider 밖에선 no-op(비게임 레이아웃 안전). */
const NOOP_ACTIONS: HeaderStatsActions = { setBase: () => {}, applyEnhanceDelta: () => {} };
export function useHeaderStatsActions(): HeaderStatsActions {
  return useContext(ActionsCtx) ?? NOOP_ACTIONS;
}

/** layout 서버값 도착 시 base 동기화 — DiamondInitializer와 동일 패턴. */
export function HeaderStatsInitializer({ stats }: { stats: HeaderStats | null }) {
  const { setBase } = useHeaderStatsActions();
  useEffect(() => {
    setBase(stats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats?.combat, stats?.maxEnhance, stats?.sumEnhance]);
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
