'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 대난투 발표 전 대기 UI — MELEE §8.
 *  - now < 9시: "오늘 9시 개시" + 9시 카운트다운
 *  - 9~9:30: "난투 진행 중 · 9:30 발표" + 9:30 카운트다운
 *  - 9:30 지났는데 아직 미발표(cron 지연): "결과 집계 중" — 자동 새로고침
 */
function fmt(ms: number): string {
  if (ms <= 0) return '00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return h > 0 ? `${h}:${mm}` : mm;
}

export function MeleeCountdown({
  runAtIso,
  revealAtIso,
  participantCount,
}: {
  runAtIso: string;
  revealAtIso: string;
  participantCount: number | null;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const runAt = new Date(runAtIso).getTime();
  const revealAt = new Date(revealAtIso).getTime();

  // 9:30 지나면 결과가 곧 뜸 — 주기적 새로고침으로 발표 반영.
  useEffect(() => {
    if (now < revealAt) return;
    const t = setTimeout(() => router.refresh(), 10_000);
    return () => clearTimeout(t);
  }, [now, revealAt, router]);

  let title: string;
  let sub: string;
  let target = 0;
  if (now < runAt) {
    title = '오늘 오전 9시 대난투 개시';
    sub = '9시 30분 결과 발표 · 강화 1회 이상이면 자동 참가';
    target = runAt;
  } else if (now < revealAt) {
    title = '난투 진행 중';
    sub = '오전 9시 30분 결과 발표';
    target = revealAt;
  } else {
    title = '결과 집계 중…';
    sub = '곧 발표됩니다';
    target = 0;
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
      <div className="text-base font-bold text-amber-300">{title}</div>
      <div className="mt-1 text-xs text-zinc-400">{sub}</div>
      {target > 0 ? (
        <div className="mt-3 font-mono text-3xl font-extrabold tabular-nums text-white">
          {fmt(target - now)}
        </div>
      ) : (
        <div className="mt-3 text-sm font-bold text-zinc-400">집계 중…</div>
      )}
      {participantCount != null ? (
        <div className="mt-3 text-[11px] text-zinc-500">
          오늘 참가 <span className="font-mono font-bold text-zinc-300">{participantCount.toLocaleString()}</span>명
        </div>
      ) : null}
    </section>
  );
}
