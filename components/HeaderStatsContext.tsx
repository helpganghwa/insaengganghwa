'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { pieceCombatPower } from '@/lib/game/balance';

/**
 * 헤더 서브라인(전투력·최고강화·합산강화)의 클라이언트 낙관 갱신 컨텍스트 — DiamondContext 패턴.
 *
 * 자동 강화는 스텝마다 layout 재렌더(revalidate)를 하지 않아(§11.7 고빈도 액션 부하) 헤더
 * 스탯이 세션 끝까지 멈춰 보였다. 스텝 응답의 레벨 변화(from→to)와 아이템 초월 수치만으로
 * 서버와 동일한 순수 공식(pieceCombatPower)을 클라에서 적용 — 추가 서버 왕복 0으로 실시간.
 *  - combat += P(to,t) − P(from,t) / sum += to−from / max = max(max, to) (max_enhance_level은 단조 증가)
 * 수동 강화·세션 종료 refresh 시 layout의 서버 권위값이 setBase로 재동기(드리프트 교정).
 */
export type HeaderStats = { combat: number; maxEnhance: number; sumEnhance: number };

type HeaderStatsCtx = {
  stats: HeaderStats | null;
  setBase: (next: HeaderStats | null) => void;
  /** 강화 결과 1건 반영 — 서버와 동일 공식의 정확 델타(표시 전용, 권위는 서버). */
  applyEnhanceDelta: (d: { fromLevel: number; toLevel: number; transcendLevel: number }) => void;
};

const Ctx = createContext<HeaderStatsCtx | null>(null);

export function HeaderStatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<HeaderStats | null>(null);
  const setBase = (next: HeaderStats | null) => setStats(next);
  const applyEnhanceDelta = ({ fromLevel, toLevel, transcendLevel }: { fromLevel: number; toLevel: number; transcendLevel: number }) => {
    setStats((s) => {
      if (!s) return s; // base 미도착 — 다음 서버값이 이미 반영된 상태로 도착
      const combatDelta = pieceCombatPower(toLevel, transcendLevel) - pieceCombatPower(fromLevel, transcendLevel);
      return {
        combat: s.combat + combatDelta,
        maxEnhance: Math.max(s.maxEnhance, toLevel),
        sumEnhance: s.sumEnhance + (toLevel - fromLevel),
      };
    });
  };
  return <Ctx.Provider value={{ stats, setBase, applyEnhanceDelta }}>{children}</Ctx.Provider>;
}

export function useHeaderStats(): HeaderStatsCtx {
  const v = useContext(Ctx);
  // Provider 밖(비게임 레이아웃 등)에서는 no-op — 강화 카드가 어디서 렌더돼도 안전.
  if (!v) return { stats: null, setBase: () => {}, applyEnhanceDelta: () => {} };
  return v;
}

/** layout 서버값 도착 시 base 동기화 — DiamondInitializer와 동일 패턴. */
export function HeaderStatsInitializer({ stats }: { stats: HeaderStats | null }) {
  const { setBase } = useHeaderStats();
  useEffect(() => {
    setBase(stats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats?.combat, stats?.maxEnhance, stats?.sumEnhance]);
  return null;
}

/** 헤더 서브라인 표시(client) — context 구독. AppHeaderShell의 정적 서브라인과 동일 마크업. */
export function HeaderStatsLine() {
  const { stats } = useHeaderStats();
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
