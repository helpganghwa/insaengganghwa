'use client';

/**
 * 월드보스 전투 재생(docs/WORLD-BOSS.md §3·§9) — 저장된 전투 기록(finale)을 한 칸씩 보여 준다.
 * 2026-10-08 리뷰 반영: 화면 가운데 배치(아래 절반이 비었다), 공격 = 보스 흔들림 + 피해 숫자, 쓰러짐 = 붉은 번쩍임 + 그 칸 회색,
 * 라운드가 바뀌면 큰 라운드 표시. 탭하면 2.5배속, 건너뛰기로 바로 결과. 결과는 서버가 출발 순간 정한 그대로라 재생만 한다.
 */
import { useEffect, useMemo, useState } from 'react';

import { formatCompactKR } from '@/lib/ui/format-number';
import type { WorldBossBattle } from '@/lib/game/world-boss/view-types';

import { Avatar } from '../../friends/Avatar';

const STEP_ATTACK_MS = 420;
const STEP_FALL_MS = 900;

export function WorldBossReplay({
  battle,
  bossName,
  spriteSrc,
  onClose,
}: {
  battle: WorldBossBattle;
  bossName: string;
  spriteSrc: string;
  onClose: () => void;
}) {
  const { roster, events } = battle.finale;
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [idx, setIdx] = useState(reduced ? events.length : 0); // 적용된 이벤트 수
  const [fast, setFast] = useState(false);
  const done = idx >= events.length;

  useEffect(() => {
    if (done) return;
    const ev = events[idx]!;
    const ms = (ev[0] < 0 ? STEP_FALL_MS : STEP_ATTACK_MS) / (fast ? 2.5 : 1);
    const t = setTimeout(() => setIdx((i) => i + 1), ms);
    return () => clearTimeout(t);
  }, [idx, done, fast, events]);

  // 지금까지 적용된 이벤트로 상태를 다시 계산(최대 65칸이라 매 단계 전부 다시 세도 가볍다).
  const st = useMemo(() => {
    const dmg = new Array<number>(roster.length).fill(0);
    const atk = new Array<number>(roster.length).fill(0);
    const fell = new Array<number | null>(roster.length).fill(null);
    let total = 0;
    let round = 1;
    for (let k = 0; k < idx; k++) {
      const [a, t, d, aux] = events[k]!;
      if (a >= 0) {
        dmg[a]! += d;
        atk[a]!++;
        total = aux;
      } else {
        fell[t] = aux;
        round = aux + 1;
      }
    }
    const last = idx > 0 ? events[idx - 1]! : null;
    return { dmg, atk, fell, total, round: Math.min(round, battle.finale.rounds), last, alive: fell.filter((f) => f == null).length };
  }, [idx, events, roster.length, battle.finale.rounds]);

  const ranked = useMemo(() => roster.map((m, i) => ({ ...m, i })).sort((a, b) => st.dmg[b.i]! - st.dmg[a.i]!), [roster, st.dmg]);
  const moved = battle.stageTo - battle.stageFrom;
  const struck = st.last && st.last[0] < 0;
  const hit = st.last && st.last[0] >= 0;
  const face = (userId: string) => battle.avatars?.[userId] ?? { src: null, box: null };

  return (
    <div className="fixed inset-0 z-50 mx-auto flex w-full max-w-[390px] flex-col bg-zinc-950 text-zinc-100" role="dialog" aria-label="원정대 전투">
      {!done ? (
        <>
          <button type="button" className="relative flex flex-1 flex-col justify-center overflow-hidden text-left" onClick={() => setFast((f) => !f)} aria-label="빠르게 보기">
            {/* 보스가 칠 때 화면 전체가 붉게 번쩍인다 */}
            {struck && <span key={`f${idx}`} className="pointer-events-none absolute inset-0 animate-wb-flash bg-red-600/30" />}
            <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+12px)] flex items-center justify-between px-4 text-[11px]">
              <span className="text-zinc-400">
                생존 <b className="text-zinc-100">{st.alive}</b>/{roster.length}
              </span>
              <span className="text-zinc-500">{fast ? '빠르게 ×2.5' : '탭하면 빠르게'}</span>
            </div>
            {/* 라운드 — 바뀔 때마다 크게 */}
            <p key={`r${st.round}`} className="animate-wb-round text-center text-[13px] font-black tracking-widest text-amber-300">
              {st.round}라운드
            </p>
            <div className="relative mx-auto mt-2 h-[180px] w-[180px]">
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.22),transparent_65%)]" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={hit ? `h${idx}` : 'b'}
                src={spriteSrc}
                alt={bossName}
                className={`relative h-full w-full object-contain ${hit ? 'animate-wb-shake' : ''} ${struck ? 'scale-110' : ''} transition-transform duration-150`}
                style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000) drop-shadow(0 0 16px rgba(251,191,36,0.55))' }}
              />
              {hit && st.last && (
                <span key={`d${idx}`} className="absolute left-1/2 top-4 -translate-x-1/2 animate-wb-float whitespace-nowrap text-[22px] font-black text-white [text-shadow:0_0_8px_#f59e0b,0_1px_2px_#000]">
                  {formatCompactKR(st.last[2])}
                </span>
              )}
            </div>
            <p className="mt-1 text-center text-[15px] font-extrabold text-amber-200">{bossName}</p>
            <p className="mt-0.5 text-center text-[12px] text-zinc-400">
              원정대 피해 <b className="font-mono text-[17px] text-amber-300 tabular-nums">{st.total.toLocaleString('ko-KR')}</b>
            </p>
            <div className="mx-3 mt-5 grid grid-cols-5 gap-1.5">
              {roster.map((m, i) => {
                const fellR = st.fell[i];
                const isHit = st.last && st.last[0] === i;
                const isStruck = struck && st.last![1] === i;
                const f = face(m.userId);
                return (
                  <div
                    key={m.userId}
                    className={`relative flex flex-col items-center gap-0.5 rounded-lg border px-0.5 pb-1 pt-1.5 text-[9.5px] transition ${
                      isStruck ? 'border-red-500 bg-red-950/70' : isHit ? 'scale-105 border-amber-400 bg-amber-900/50' : 'border-zinc-800 bg-zinc-900'
                    } ${fellR != null && !isStruck ? 'opacity-35 grayscale' : ''}`}
                  >
                    {f.src ? (
                      <Avatar src={f.src} box={f.box} size="h-9 w-9 rounded-full bg-zinc-800" />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-[13px] font-black">{m.nickname.slice(0, 1)}</span>
                    )}
                    <span className="w-full truncate text-center font-bold">{m.nickname}</span>
                    <span className="font-mono tabular-nums text-zinc-400">{formatCompactKR(st.dmg[i]!)}</span>
                    {fellR != null && <span className="absolute right-0.5 top-0.5 rounded bg-red-900/80 px-0.5 text-[7.5px] text-red-200">쓰러짐</span>}
                  </div>
                );
              })}
            </div>
            <p className="mx-6 mt-4 text-center text-[10px] text-zinc-500">살아 있는 원정대원이 모두 한 번씩 공격하고, 보스가 한 명을 쓰러뜨려요.</p>
          </button>
          <button
            type="button"
            onClick={() => setIdx(events.length)}
            className="mx-4 mb-[calc(env(safe-area-inset-bottom,0px)+14px)] rounded-lg border border-zinc-700 py-2.5 text-[12.5px] font-bold text-zinc-300"
          >
            건너뛰기
          </button>
        </>
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+16px)]">
          {/* 결과 — 보스·단계 상승을 크게, 표는 아래 */}
          <div className="flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={spriteSrc}
              alt=""
              className="h-24 w-24 object-contain"
              style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 12px rgba(251,191,36,0.5))' }}
            />
            <p className="text-[12px] text-zinc-400">{battle.leaderNickname} 원정대 · {battle.finale.rounds}라운드</p>
            <p className="mt-1 text-[30px] font-black leading-tight text-amber-300">{battle.finale.totalDamage.toLocaleString('ko-KR')}</p>
            <p className="text-[11px] text-zinc-500">원정대 피해</p>
            {moved > 0 ? (
              <p className="mt-2 animate-wb-round rounded-full bg-amber-500/15 px-3 py-1 text-[14px] font-extrabold text-amber-200 ring-1 ring-amber-500/50">
                {bossName} {battle.stageFrom}단계 → {battle.stageTo}단계 <span className="text-amber-300">+{moved}</span>
              </p>
            ) : (
              <p className="mt-2 text-[12px] text-zinc-400">보스 {battle.stageTo}단계 그대로</p>
            )}
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-amber-950/50 px-3 py-2.5">
            <span className="text-[12px] text-zinc-300">모두에게</span>
            <b className="text-[17px] text-amber-200">
              💎{battle.reward.diamond.toLocaleString('ko-KR')} 📦{battle.reward.boxes}
            </b>
            <span className="text-[10.5px] text-zinc-500">우편 도착</span>
          </div>
          <table className="mt-3 w-full text-[11px]">
            <thead>
              <tr className="text-left text-zinc-500">
                <th className="py-1 font-semibold">원정대원</th>
                <th className="py-1 text-right font-semibold">공격</th>
                <th className="py-1 text-right font-semibold">피해</th>
                <th className="py-1 text-right font-semibold">버틴 라운드</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((m, r) => (
                <tr key={m.userId} className="border-t border-zinc-800">
                  <td className="max-w-[140px] truncate py-1.5">
                    <span className={`mr-1 font-mono ${r === 0 ? 'text-amber-300' : 'text-zinc-600'}`}>{r + 1}</span>
                    {m.nickname}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{st.atk[m.i]}</td>
                  <td className={`py-1.5 text-right font-mono tabular-nums ${r === 0 ? 'text-amber-300' : ''}`}>{formatCompactKR(st.dmg[m.i]!)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{st.fell[m.i] ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <span className="flex-1" />
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setFast(false);
                setIdx(0);
              }}
              className="flex-1 rounded-lg border border-zinc-700 py-2.5 text-[12.5px] font-bold text-zinc-300"
            >
              다시 보기
            </button>
            <button type="button" onClick={onClose} className="flex-[2] rounded-lg bg-amber-500 py-2.5 text-[13px] font-extrabold text-amber-950">
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
