import Link from 'next/link';

import type { TodayTicker as TickerData } from '@/lib/game/today/stats';

/**
 * 홈 '오늘의 인생강화' — 2줄 고정(2026-07-16 확정: 롤링 폐기):
 *  1줄 = 전투력/최고/합산(증감 있을 때만 ▲▼), 2줄 = 강화 시도/성공/유지/하락.
 * 상태 없음 → 서버 컴포넌트. 전체 영역 탭 → /today.
 */
const fmt = (n: number) => n.toLocaleString('ko-KR');

function Delta({ d }: { d: number | null }) {
  if (!d) return null;
  return d > 0 ? (
    <span className="font-extrabold text-emerald-600 dark:text-emerald-400"> ▲{fmt(d)}</span>
  ) : (
    <span className="font-extrabold text-red-500 dark:text-red-400"> ▼{fmt(-d)}</span>
  );
}

export function TodayTicker({ data }: { data: TickerData }) {
  return (
    <Link
      href="/today"
      className="flex flex-col gap-0.5 rounded-xl border border-amber-500/50 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent px-3 py-1.5"
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-[10px] font-extrabold text-amber-600 dark:text-amber-400">
          오늘의 인생강화
        </span>
        <span className="min-w-0 flex-1 truncate text-right text-[11px] font-medium tabular-nums text-zinc-800 dark:text-zinc-100">
          전투력 <b>{fmt(data.combat)}</b>
          <Delta d={data.combatDelta} /> · 최고 <b>+{fmt(data.maxEnhance)}</b>
          <Delta d={data.maxDelta} /> · 합산 <b>+{fmt(data.sumEnhance)}</b>
          <Delta d={data.sumDelta} />
        </span>
      </div>
      <div className="truncate text-right text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300">
        강화 <b>{data.attempts}회</b> · 성공{' '}
        <b className="text-emerald-600 dark:text-emerald-400">{data.success}</b> · 유지 {data.hold} · 하락{' '}
        <span className={data.down > 0 ? 'font-bold text-red-500 dark:text-red-400' : ''}>{data.down}</span>
      </div>
    </Link>
  );
}
