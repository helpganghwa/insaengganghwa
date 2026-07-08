import type { ReactNode } from 'react';

import { getEnhanceLive } from '@/lib/game/stats/queries';

/** 큰 수 압축 표기 — 4타일 폭(≈90px)에 들어가게. */
function fmtCompact(n: number): string {
  return new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

type StatTone = 'live' | 'success' | 'hold' | 'down';
const TONE: Record<StatTone, { num: string; label: string }> = {
  live: { num: 'text-amber-200', label: 'text-amber-300/80' },
  success: { num: 'text-emerald-200', label: 'text-emerald-300/80' },
  hold: { num: 'text-zinc-200', label: 'text-zinc-400' },
  down: { num: 'text-rose-200', label: 'text-rose-300/80' },
};

function StatTile({ tone, value, label }: { tone: StatTone; value: string; label: string }) {
  const t = TONE[tone];
  return (
    <div className="flex flex-1 flex-col items-center gap-1 px-1">
      <span className={`text-[9px] font-medium tracking-wide ${t.label}`}>{label}</span>
      <span className={`font-mono text-[13px] font-bold tabular-nums ${t.num}`}>{value}</span>
    </div>
  );
}

/**
 * 실시간 인생강화 통계 카드 — 프로필(/u)·로그인 공용(디자인 단일 출처).
 * KPI 카드와 톤 통일(평면 zinc-900/85 + zinc-800 border + rounded-xl).
 */
function StatsShell({ children }: { children: ReactNode }) {
  return (
    <section className="w-full rounded-xl border border-zinc-800 bg-zinc-900/85 p-2.5">
      <div className="mb-2 text-[10px] font-semibold tracking-wide text-zinc-400">지금 인생강화에서</div>
      <div className="flex divide-x divide-zinc-800/80">{children}</div>
    </section>
  );
}

export async function EnhanceStatsCard() {
  const s = await getEnhanceLive();
  return (
    <StatsShell>
      <StatTile tone="live" value={`${s.totalUsers.toLocaleString('ko-KR')}명`} label="인생강화중" />
      <StatTile tone="success" value={fmtCompact(s.success)} label="강화 성공" />
      <StatTile tone="hold" value={fmtCompact(s.hold)} label="강화 유지" />
      <StatTile tone="down" value={fmtCompact(s.down)} label="강화 하락" />
    </StatsShell>
  );
}

export function EnhanceStatsFallback() {
  return (
    <StatsShell>
      <StatTile tone="live" value="—" label="인생강화중" />
      <StatTile tone="success" value="—" label="강화 성공" />
      <StatTile tone="hold" value="—" label="강화 유지" />
      <StatTile tone="down" value="—" label="강화 하락" />
    </StatsShell>
  );
}
