'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { assetUrl } from '@/lib/asset-versions';
import { CONQUEST_HP_MULT } from '@/lib/game/guild/balance';
import type { ConquestBattleView as View } from '@/lib/game/guild/conquest/battle-view';

// 길드별 색상 — 로스터 등장 순서대로 배정(승자/패자 시각 구분). ConquestReplay와 동일 팔레트.
const TEAM_COLORS = ['#f59e0b', '#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#ec4899', '#14b8a6', '#eab308'];

const REGION: Record<string, { label: string; color: string }> = {
  volcano: { label: '드래곤 화산', color: '#ef4444' },
  temple: { label: '잊힌 신전', color: '#60a5fa' },
  swamp: { label: '슬라임 늪', color: '#22c55e' },
  orc: { label: '오크 부락', color: '#f97316' },
  kingdom: { label: '왕국', color: '#fbbf24' },
  angel: { label: '타락 천사 부유섬', color: '#c084fc' },
};

export function ConquestBattleView({ view }: { view: View }) {
  const router = useRouter();
  const { roster, events } = view;
  const [step, setStep] = useState(0); // 0..events.length (적용된 이벤트 수)
  const [playing, setPlaying] = useState(events.length > 0);
  const [speed, setSpeed] = useState(1);
  const logRef = useRef<HTMLUListElement>(null);

  const region = REGION[view.zoneRegion] ?? { label: view.zoneRegion, color: '#71717a' };

  // 길드 → 색(로스터 등장 순서).
  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    roster.forEach((r) => {
      if (!m.has(r.guildId)) m.set(r.guildId, TEAM_COLORS[m.size % TEAM_COLORS.length]!);
    });
    return m;
  }, [roster]);

  const maxHp = useMemo(() => roster.map((r) => Math.max(1, r.effCp * CONQUEST_HP_MULT)), [roster]);

  // step까지 폴드 → 각 유닛 현재 HP.
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

  // 무대 정렬 — 승자 길드 먼저, 같은 길드 내 순위 오름차순. 원본 인덱스(i)는 HP/이벤트 참조에 유지.
  const order = useMemo(() => {
    const winnerId = view.winner?.guildId ?? null;
    const guildSeq = new Map<string, number>();
    roster.forEach((r) => {
      if (!guildSeq.has(r.guildId)) guildSeq.set(r.guildId, guildSeq.size);
    });
    return roster
      .map((r, i) => ({ i, r }))
      .sort((a, b) => {
        const aw = a.r.guildId === winnerId ? 0 : 1;
        const bw = b.r.guildId === winnerId ? 0 : 1;
        if (aw !== bw) return aw - bw;
        const gs = (guildSeq.get(a.r.guildId) ?? 0) - (guildSeq.get(b.r.guildId) ?? 0);
        if (gs !== 0) return gs;
        return a.r.rank - b.r.rank;
      })
      .map((x) => x.i);
  }, [roster, view.winner]);

  useEffect(() => {
    if (!playing || atEnd) return;
    const t = setTimeout(() => setStep((s) => Math.min(events.length, s + 1)), 600 / speed);
    return () => clearTimeout(t);
  }, [playing, atEnd, step, events.length, speed]);

  // 진행 중 활성 라운드를 로그에서 보이게 스크롤.
  useEffect(() => {
    if (step <= 0) return;
    logRef.current?.querySelector<HTMLElement>(`[data-round="${step}"]`)?.scrollIntoView({
      block: 'nearest',
    });
  }, [step]);

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* 헤더 — 지역 배경 + 구역명/날짜 + 승자 */}
      <div
        className="relative shrink-0"
        style={{ background: `linear-gradient(135deg, ${region.color}, #0b0e16)` }}
      >
        <div
          className="absolute inset-0 bg-cover bg-center opacity-60"
          style={{ backgroundImage: `url(${assetUrl(`/sprites/guild/region/${view.zoneRegion}.png`)})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/25" />
        <div className="relative px-4 pb-3 pt-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="mb-2 inline-flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-white/90 ring-1 ring-white/25 backdrop-blur-sm"
          >
            ← 세계지도
          </button>
          <p className="text-[11px] font-medium text-white/75" style={{ color: region.color }}>
            {region.label}
          </p>
          <h1 className="mt-0.5 text-lg font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
            {view.zoneName} 점령전
          </h1>
          <p className="mt-0.5 text-[11px] text-white/70">
            {view.kstDay.replace(/-/g, '.')} · {view.guildCount}개 길드 · {view.participantCount}명 참전
          </p>
          {view.winner ? (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 py-1 pl-1.5 pr-3 ring-1 ring-white/25 backdrop-blur-sm">
              {view.winner.emblemUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={view.winner.emblemUrl}
                  alt=""
                  aria-hidden
                  className="h-5 w-5 object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : null}
              <span className="text-[12px] font-bold text-white">
                <span className="text-amber-300">승리</span> · {view.winner.name}
              </span>
            </div>
          ) : (
            <div className="mt-2 inline-flex rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold text-white/80 ring-1 ring-white/25">
              무혈 · 승자 없음
            </div>
          )}
        </div>
      </div>

      {/* 길드 대진 요약 */}
      <div className="grid grid-cols-2 gap-2 px-4 pt-3">
        {view.guilds.map((g) => (
          <div
            key={g.guildId}
            className={`rounded-xl border p-2.5 ${
              g.isWinner
                ? 'border-amber-300 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10'
                : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorOf.get(g.guildId) }}
              />
              <span className="min-w-0 flex-1 truncate text-[12px] font-bold">{g.guildName}</span>
              {g.isWinner && <span className="shrink-0 text-[10px] font-bold text-amber-500">점령</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-[11px] text-zinc-500">
              <span>
                생존 <span className="font-mono font-bold text-zinc-700 dark:text-zinc-200">{g.survivors}</span>/{g.memberCount}
              </span>
              <span>
                처치 <span className="font-mono font-bold text-red-500">{g.kills}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      {events.length === 0 ? (
        <p className="mx-4 mt-4 rounded-xl bg-zinc-100 px-3 py-6 text-center text-[12px] text-zinc-500 dark:bg-zinc-900">
          무혈 결착 — 전투 기록이 없습니다.
        </p>
      ) : (
        <>
          {/* 무대 — 현재 라운드 + 유닛 HP 바 */}
          <div className="mt-3 px-4">
            <div className="flex h-9 items-center rounded-lg bg-zinc-100 px-3 text-[12px] dark:bg-zinc-900">
              {active ? (
                <span className="truncate">
                  <span
                    className="font-bold"
                    style={{ color: colorOf.get(roster[active[0]]!.guildId) }}
                  >
                    {roster[active[0]]!.nickname}
                  </span>{' '}
                  → {roster[active[1]]!.nickname}{' '}
                  <span className="font-mono font-bold text-red-500">-{active[2]}</span>
                  {active[3] <= 0 && (
                    <span className="ml-1 text-[10px] font-bold text-zinc-400">탈락</span>
                  )}
                </span>
              ) : (
                <span className="text-zinc-400">▶ 재생을 눌러 전투를 확인하세요</span>
              )}
            </div>

            <ul className="mt-2.5 space-y-1.5">
              {order.map((i) => {
                const r = roster[i]!;
                const ratio = Math.max(0, Math.min(1, hp[i]! / maxHp[i]!));
                const dead = hp[i]! <= 0;
                const isActor = active?.[0] === i;
                const isTarget = active?.[1] === i;
                return (
                  <li
                    key={i}
                    className={`flex items-center gap-2 rounded-lg px-1 py-0.5 ${
                      r.isMe ? 'bg-amber-50 dark:bg-amber-500/10' : ''
                    } ${isActor ? 'ring-1 ring-zinc-300 dark:ring-zinc-700' : ''}`}
                  >
                    <span
                      className="relative block h-7 w-7 shrink-0 overflow-hidden rounded-md bg-zinc-200 dark:bg-zinc-800"
                      style={{ opacity: dead ? 0.35 : 1 }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.avatar}
                        alt=""
                        aria-hidden
                        className="h-full w-full object-cover"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1">
                        <span
                          className={`truncate text-[11px] ${dead ? 'text-zinc-400 line-through' : 'text-zinc-700 dark:text-zinc-200'} ${isActor ? 'font-bold' : 'font-medium'}`}
                        >
                          {r.nickname}
                        </span>
                        {r.isMe && <span className="shrink-0 text-[9px] font-bold text-amber-500">나</span>}
                      </div>
                      <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
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
                    </div>
                    <span className="w-9 shrink-0 text-right text-[9px] tabular-nums text-zinc-400">
                      #{r.rank}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* 컨트롤 */}
          <div className="sticky bottom-0 z-10 mt-3 border-t border-zinc-200 bg-zinc-50/95 px-4 py-2.5 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95">
            <div className="flex items-center gap-2">
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
                onClick={() => setSpeed((s) => (s >= 8 ? 1 : s * 2))}
                className="w-9 shrink-0 rounded-lg border border-zinc-300 py-1.5 text-[11px] font-semibold dark:border-zinc-700"
              >
                {speed}×
              </button>
            </div>
            <p className="mt-1 text-right text-[10px] text-zinc-400">
              {step}/{events.length} 라운드
            </p>
          </div>

          {/* 전투 로그 — 라운드별, 클릭 시 해당 시점으로 점프 */}
          <div className="px-4 pb-6 pt-2">
            <h2 className="mb-1.5 text-[11px] font-bold text-zinc-400">전투 로그</h2>
            <ul ref={logRef} className="space-y-1">
              {events.map((ev, idx) => {
                const round = idx + 1;
                const atk = roster[ev[0]]!;
                const tgt = roster[ev[1]]!;
                const dead = ev[3] <= 0;
                const isCur = step === round;
                return (
                  <li key={idx} data-round={round}>
                    <button
                      type="button"
                      onClick={() => {
                        setPlaying(false);
                        setStep(round);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition ${
                        isCur
                          ? 'bg-zinc-200 dark:bg-zinc-800'
                          : 'bg-white hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span className="w-8 shrink-0 font-mono tabular-nums text-zinc-400">{round}</span>
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: colorOf.get(atk.guildId) }}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                          {atk.nickname}
                        </span>
                        <span className="text-zinc-400"> → </span>
                        <span className={dead ? 'text-zinc-400 line-through' : 'text-zinc-600 dark:text-zinc-300'}>
                          {tgt.nickname}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono font-bold text-red-500">-{ev[2]}</span>
                      {dead && <span className="shrink-0 text-[9px] font-bold text-zinc-400">탈락</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
