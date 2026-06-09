'use client';

import { useEffect, useMemo, useState } from 'react';

import { CONQUEST_HP_MULT } from '@/lib/game/guild/balance';
import type { ConquestFinale } from '@/lib/game/guild/conquest/simulate';

type Battle = {
  battleKstDay: string;
  winnerGuildId: string | null;
  winnerName: string | null;
  finale: ConquestFinale;
};

// 길드별 색상 — 등장 순서대로 배정(승자/패자 시각 구분).
const TEAM_COLORS = ['#f59e0b', '#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#ec4899', '#14b8a6', '#eab308'];

export function ConquestReplay({ battle, onClose }: { battle: Battle; onClose: () => void }) {
  const { roster, events } = battle.finale;
  const [step, setStep] = useState(0); // 0..events.length (적용된 이벤트 수)
  const [playing, setPlaying] = useState(events.length > 0);
  const [speed, setSpeed] = useState(1);

  // 길드 → 색.
  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    roster.forEach((r) => {
      if (!m.has(r.guildId)) m.set(r.guildId, TEAM_COLORS[m.size % TEAM_COLORS.length]!);
    });
    return m;
  }, [roster]);

  const maxHp = useMemo(() => roster.map((r) => Math.max(1, r.effCp * CONQUEST_HP_MULT)), [roster]);

  // step까지 이벤트 폴드 → 각 유닛 현재 HP(이벤트의 hpAfter가 권위).
  const hp = useMemo(() => {
    const cur = maxHp.slice();
    for (let i = 0; i < step; i++) {
      const ev = events[i];
      if (ev) cur[ev[1]] = ev[3];
    }
    return cur;
  }, [step, events, maxHp]);

  const active = step > 0 && step <= events.length ? events[step - 1] : null;
  const atEnd = step >= events.length;

  useEffect(() => {
    if (!playing || atEnd) return; // 끝이면 스케줄 안 함(라벨은 atEnd로 파생)
    const t = setTimeout(() => setStep((s) => Math.min(events.length, s + 1)), 600 / speed);
    return () => clearTimeout(t);
  }, [playing, atEnd, step, events.length, speed]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-[390px] overflow-y-auto rounded-2xl bg-white p-4 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold">점령전 리플레이</h2>
          <button type="button" onClick={onClose} className="text-xs text-zinc-500">
            닫기
          </button>
        </div>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {battle.battleKstDay} · 승자{' '}
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
            {battle.winnerName ?? '없음'}
          </span>
        </p>

        {events.length === 0 ? (
          <p className="mt-4 rounded-lg bg-zinc-100 px-3 py-4 text-center text-[12px] text-zinc-500 dark:bg-zinc-900">
            무혈 결착 — 전투 기록이 없습니다.
          </p>
        ) : (
          <>
            {/* 현재 라운드 */}
            <div className="mt-3 h-9 rounded-lg bg-zinc-100 px-3 text-[12px] leading-9 dark:bg-zinc-900">
              {active ? (
                <span>
                  <span className="font-semibold" style={{ color: colorOf.get(roster[active[0]]!.guildId) }}>
                    {roster[active[0]]!.nickname}
                  </span>{' '}
                  → {roster[active[1]]!.nickname}{' '}
                  <span className="font-mono text-red-500">-{active[2]}</span>
                  {active[3] <= 0 && <span className="ml-1 text-[10px] font-bold text-zinc-400">탈락</span>}
                </span>
              ) : (
                <span className="text-zinc-400">▶ 재생을 눌러 전투를 확인하세요</span>
              )}
            </div>

            {/* 유닛 HP 바 */}
            <ul className="mt-3 space-y-1.5">
              {roster.map((r, i) => {
                const ratio = Math.max(0, Math.min(1, hp[i]! / maxHp[i]!));
                const dead = hp[i]! <= 0;
                const isActor = active?.[0] === i;
                const isTarget = active?.[1] === i;
                return (
                  <li key={i} className="flex items-center gap-2">
                    <span
                      className={`w-20 shrink-0 truncate text-[11px] ${dead ? 'text-zinc-400 line-through' : ''} ${isActor ? 'font-bold' : ''}`}
                    >
                      {r.nickname}
                    </span>
                    <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full transition-[width] duration-200"
                        style={{
                          width: `${ratio * 100}%`,
                          backgroundColor: colorOf.get(r.guildId),
                          opacity: dead ? 0.25 : 1,
                          outline: isTarget ? '2px solid #ef4444' : 'none',
                        }}
                      />
                    </div>
                    <span className="w-7 shrink-0 text-right text-[9px] tabular-nums text-zinc-500">
                      #{r.rank}
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* 컨트롤 */}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (atEnd) {
                    setStep(0);
                    setPlaying(true);
                  } else {
                    setPlaying((p) => !p);
                  }
                }}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white dark:bg-zinc-200 dark:text-zinc-900"
              >
                {atEnd ? '다시' : playing ? '일시정지' : '재생'}
              </button>
              <input
                type="range"
                min={0}
                max={events.length}
                value={step}
                onChange={(e) => {
                  setPlaying(false);
                  setStep(Number(e.target.value));
                }}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => setSpeed((s) => (s >= 4 ? 1 : s * 2))}
                className="w-9 shrink-0 rounded-lg border border-zinc-300 py-1.5 text-[11px] font-semibold dark:border-zinc-700"
              >
                {speed}×
              </button>
            </div>
            <p className="mt-1 text-right text-[10px] text-zinc-400">
              {step}/{events.length} 라운드
            </p>
          </>
        )}
      </div>
    </div>
  );
}
