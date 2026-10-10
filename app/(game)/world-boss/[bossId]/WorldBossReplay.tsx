'use client';

/**
 * 월드보스 전투 재생(docs/WORLD-BOSS.md §3·§9) — 저장된 전투 기록(finale)을 한 칸씩 보여 준다.
 * 10-11 사용자 C안: 무대(300px, 너무 크지 않게) 안에서 보스가 움직이고 피해 숫자·보상이 튀며, 무대 발밑에 **텍스트 RPG식 일지**가
 * 한 줄씩 떠오른다(▶ 공격 · ✦ 보스 · 라운드 머리). 아래는 대난투 순위 목록처럼 **얼굴을 행 오른쪽에 크게** 깐 컴팩트 행(50px).
 * 공격 = 보스 흔들림 + 피해 숫자, 쓰러짐 = 붉은 번쩍임 + 그 행 흑백, 라운드가 바뀌면 큰 라운드 표시. 큰 당첨(💎300+ · 📦90+)은
 * 글자 없이 효과로만(금빛 광선·번쩍임·크게 — 2026-10-08 사용자: '대박!' 같은 텍스트 금지). 탭하면 2.5배속, 건너뛰기로 바로 결과.
 * 결과는 **팝업**(10-11 사용자) — 닫으면 끝난 전투 화면(무대·일지 전체·명단)이 남고 '결과 보기'로 다시 연다. 안내 문구는 두지 않는다.
 * 원정대장은 행·결과 표에 '원정대장' 칩으로 보인다(10-11 사용자: 어울리는 곳엔 최대한).
 */
import { josa } from 'josa';
import { useEffect, useMemo, useRef, useState } from 'react';

import { meleeFaceCropStyle } from '@/components/faceCrop';
import { GuildBadge } from '@/components/GuildBadge';
import { WorldBossBackdrop } from '@/components/WorldBossBackdrop';
import { WorldBossSprite } from '@/components/WorldBossSprite';
import { assetUrl } from '@/lib/asset-versions';
import { worldBossBgEmberUrl } from '@/lib/game/world-boss/bosses';
import { formatCompactKR } from '@/lib/ui/format-number';
import type { WorldBossBattle } from '@/lib/game/world-boss/view-types';

import { LeaderChip } from './LeaderChip';

const STEP_ATTACK_MS = 520;
const STEP_FALL_MS = 1000;
/** 일지 동사 — 공격 순서대로 돌려 쓴다(무기 종류는 기록에 없어 두루 맞는 말만). */
const VERBS = ['휘두른다', '내리친다', '꽂아 넣는다', '후려친다', '찔러 넣는다'];

type LogLine = { key: string; kind: 'round' | 'atk' | 'boss'; text: string; dmg?: number; loot?: string; weak?: number };

export function WorldBossReplay({
  battle,
  bossName,
  bossTraits = [],
  bgSrc,
  onClose,
}: {
  battle: WorldBossBattle;
  bossName: string;
  /** 보스 특성 — 이름 오른쪽 아이콘(10-10). */
  bossTraits?: { code: string; icon: string; name: string }[];
  bgSrc: string;
  onClose: () => void;
}) {
  const { roster, events } = battle.finale;
  const drops = battle.finale.drops ?? [];
  const weakBits = battle.finale.weak ?? [];
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [idx, setIdx] = useState(reduced ? events.length : 0); // 적용된 이벤트 수
  const [fast, setFast] = useState(false);
  const done = idx >= events.length;
  // 결과는 팝업(10-11 사용자) — 닫으면 끝난 전투 화면(무대·일지 전체·명단)이 남아 다시 읽을 수 있다.
  const [resultDismissed, setResultDismissed] = useState(false);
  const resultOpen = done && !resultDismissed;

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
    const gotD = new Array<number>(roster.length).fill(0);
    const gotB = new Array<number>(roster.length).fill(0);
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
        gotD[a]! += drops[k]?.[0] ?? 0;
        gotB[a]! += drops[k]?.[1] ?? 0;
      } else {
        fell[t] = aux;
        round = aux + 1;
      }
    }
    const last = idx > 0 ? events[idx - 1]! : null;
    const lastDrop = idx > 0 ? (drops[idx - 1] ?? null) : null;
    return { dmg, atk, fell, gotD, gotB, total, round: Math.min(round, battle.finale.rounds), last, lastDrop, alive: fell.filter((f) => f == null).length };
  }, [idx, events, drops, roster.length, battle.finale.rounds]);

  // 일지(텍스트 RPG) — 적용된 이벤트를 문장으로. 무기 이름이 기록돼 있으면 "창천검을 휘두른다", 없으면(옛 기록) "일격".
  const lines = useMemo(() => {
    const out: LogLine[] = [{ key: 'r1', kind: 'round', text: '1라운드' }];
    for (let k = 0; k < idx; k++) {
      const [a, t, d, aux] = events[k]!;
      if (a >= 0) {
        const m = roster[a]!;
        const weapon = m.items?.find((i) => i.slot === 'weapon')?.name;
        const verb = VERBS[k % VERBS.length]!;
        const drop = drops[k];
        const wb = weakBits[k] ?? 0;
        out.push({
          key: `e${k}`,
          kind: 'atk',
          text: weapon ? josa(`${m.nickname}, ${weapon}#{을} ${verb}`) : josa(`${m.nickname}#{이} 일격을 날린다`),
          dmg: d,
          loot: drop && drop[0] > 0 ? `💎${drop[0].toLocaleString('ko-KR')}` : drop && drop[1] > 0 ? `📦${drop[1]}` : undefined,
          weak: [1, 2, 4].filter((b) => (wb & b) !== 0).length,
        });
      } else {
        const m = roster[t]!;
        out.push({ key: `e${k}`, kind: 'boss', text: josa(`${bossName}의 날갯짓 — 잿불이 ${m.nickname}#{을} 덮쳤다. 쓰러짐`) });
        if (aux + 1 <= battle.finale.rounds && k < events.length - 1) out.push({ key: `r${aux + 1}`, kind: 'round', text: `${aux + 1}라운드` });
      }
    }
    return out;
  }, [idx, events, roster, drops, weakBits, bossName, battle.finale.rounds]);
  const shown = lines.slice(-3);

  const ranked = useMemo(() => roster.map((m, i) => ({ ...m, i })).sort((a, b) => st.dmg[b.i]! - st.dmg[a.i]!), [roster, st.dmg]);
  const moved = battle.stageTo - battle.stageFrom;
  const struck = st.last && st.last[0] < 0;
  const hit = st.last && st.last[0] >= 0;
  const face = (userId: string) => battle.avatars?.[userId] ?? { src: null, box: null };
  const isLeader = (nickname: string) => nickname === battle.leaderNickname;

  // 대원이 칠 때 보스 흔들림 — Web Animations로 그 자리에서만 흔들어 대기 애니(띠)가 처음으로 돌아가지 않게 한다.
  const shakeRef = useRef<HTMLDivElement>(null);
  // 목록 — 지금 공격하는(또는 쓰러지는) 대원 행을 화면 안으로.
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    const ev = idx > 0 ? events[idx - 1] : null;
    if (!ev) return;
    const who = ev[0] >= 0 ? ev[0] : ev[1];
    rowRefs.current[who]?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [idx, events, reduced]);
  useEffect(() => {
    if (!hit || reduced) return;
    shakeRef.current?.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }],
      { duration: 280, easing: 'ease-in-out' },
    );
  }, [idx, hit, reduced]);

  const jackpot = !!hit && !!st.lastDrop && (st.lastDrop[0] >= 300 || st.lastDrop[1] >= 90);

  return (
    <div className="fixed inset-0 z-50 mx-auto flex w-full max-w-[390px] flex-col bg-stone-950 text-stone-100" role="dialog" aria-label="원정대 전투">
      <>
          {/* 위 — 무대(배경 + 보스 + 일지). 탭하면 빠르게. 글자는 어두운 바탕 위에만 둬 숲 배경에서도 읽힌다(리뷰 R1). */}
          <button
            type="button"
            className="relative h-[300px] shrink-0 overflow-hidden text-left"
            onClick={() => setFast((f) => !f)}
            aria-label="빠르게 보기"
          >
            <WorldBossBackdrop bgSrc={bgSrc} emberSrc={assetUrl(worldBossBgEmberUrl())} className="opacity-85" />
            <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(9,9,11,0.75)_0%,transparent_20%,transparent_55%,#09090b_100%)]" />
            {/* 보스가 칠 때 가장자리만 붉게 물든다(전체를 덮으면 분홍으로 튐 — 2026-10-09) */}
            {struck && <span key={`f${idx}`} className="wb-vignette pointer-events-none absolute inset-0 animate-wb-flash" />}
            {jackpot && <span key={`fj${idx}`} className="pointer-events-none absolute inset-0 animate-wb-flash bg-orange-300/35" />}
            <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+10px)] z-10 flex items-center justify-between px-3 text-[11px]">
              <span className="rounded-full bg-black/60 px-2 py-0.5 text-stone-300">
                생존 <b className="text-white">{st.alive}</b>/{roster.length}
              </span>
              {/* 라운드 — 바뀔 때마다 크게 */}
              <span key={`r${st.round}`} className="animate-wb-round rounded-full bg-black/60 px-2.5 py-0.5 text-[12px] font-black tracking-widest text-orange-300">
                {st.round}라운드
              </span>
              <span className="rounded-full bg-black/60 px-2 py-0.5 text-stone-400">{fast ? '빠르게 ×2.5' : '탭하면 빠르게'}</span>
            </div>
            <div className="absolute left-1/2 top-[40%] h-[140px] w-[140px] -translate-x-1/2 -translate-y-1/2">
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.22),transparent_65%)]" />
              {/* 보스 — 대기 애니는 계속 돌고, 대원이 치면 흔들림, 보스가 치면 다가오기 + 불씨 플레어(WorldBossSprite attack) */}
              <div ref={shakeRef} className="relative h-full w-full">
                <WorldBossSprite
                  alt={bossName}
                  attack={struck ? idx : null}
                  className="h-full w-full"
                  style={{ filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000) drop-shadow(0 0 16px rgba(249,115,22,0.45))' }}
                />
              </div>
              {/* 큰 당첨 — 글자 없이 효과로만(금빛 광선 + 번쩍임 + 크게) */}
              {jackpot && (
                <span key={`j${idx}`} className="pointer-events-none absolute -inset-10 animate-wb-jackpot rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(249,115,22,0.55)_20deg,transparent_40deg,transparent_60deg,rgba(249,115,22,0.55)_80deg,transparent_100deg,transparent_120deg,rgba(249,115,22,0.55)_140deg,transparent_160deg,transparent_180deg,rgba(249,115,22,0.55)_200deg,transparent_220deg,transparent_240deg,rgba(249,115,22,0.55)_260deg,transparent_280deg,transparent_300deg,rgba(249,115,22,0.55)_320deg,transparent_340deg)]" />
              )}
              {hit && st.last && (
                <span key={`d${idx}`} className="absolute left-1/2 top-1 -translate-x-1/2 animate-wb-float whitespace-nowrap text-[24px] font-black text-white [text-shadow:0_0_8px_#ea580c,0_1px_2px_#000,0_0_2px_#000]">
                  {formatCompactKR(st.last[2])}
                </span>
              )}
              {hit && st.lastDrop && (st.lastDrop[0] > 0 || st.lastDrop[1] > 0) && (
                <span
                  key={`g${idx}`}
                  className={`absolute left-1/2 top-10 -translate-x-1/2 animate-wb-round whitespace-nowrap rounded-full px-2.5 py-0.5 font-black ${
                    jackpot
                      ? 'bg-gradient-to-r from-orange-300 via-amber-200 to-orange-400 text-[19px] text-orange-50 shadow-[0_0_24px_6px_rgba(249,115,22,0.85)] ring-2 ring-amber-100'
                      : 'bg-black/70 text-[13px] text-orange-200'
                  }`}
                >
                  {st.lastDrop[0] > 0 ? `💎${st.lastDrop[0].toLocaleString('ko-KR')}` : `📦${st.lastDrop[1]}`}
                </span>
              )}
            </div>
            {/* 일지 — 무대 발밑 어두운 알약 위에 마지막 3줄. 새 줄은 아래서 떠오른다. */}
            <div className="pointer-events-none absolute inset-x-2 bottom-8 z-10 flex flex-col gap-1">
              {shown.map((l, i) => {
                const newest = i === shown.length - 1;
                return (
                  <p
                    key={l.key}
                    className={`overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-2 py-1 text-[11.5px] leading-snug [text-shadow:0_1px_2px_#000] ${newest ? 'animate-wb-line' : ''} ${
                      l.kind === 'round'
                        ? 'self-center bg-black/55 px-3 text-[10.5px] tracking-widest text-stone-400'
                        : l.kind === 'boss'
                          ? 'border-l-2 border-red-500 bg-black/70 text-red-200'
                          : 'bg-black/65 text-stone-100'
                    }`}
                  >
                    {l.kind === 'atk' ? (
                      <>
                        ▶ {l.text} — <b className="font-mono text-orange-300">{formatCompactKR(l.dmg ?? 0)}</b>
                        {l.weak ? <b className={`ml-1 ${l.weak >= 2 ? 'text-amber-200' : 'text-orange-300'}`}>약점 적중{l.weak >= 2 ? ` ×${l.weak}` : ''}!</b> : null}
                        {l.loot ? <span className="ml-1 text-orange-200">⚑ {l.loot}</span> : null}
                      </>
                    ) : l.kind === 'boss' ? (
                      <>✦ {l.text}</>
                    ) : (
                      <>— {l.text} —</>
                    )}
                  </p>
                );
              })}
            </div>
            {/* 보스 이름 · 원정대 피해 — 무대 맨 아래 */}
            <div className="absolute inset-x-0 bottom-1.5 z-10 flex items-baseline justify-between px-3">
              <span className="flex items-center gap-1.5 text-[13px] font-extrabold text-orange-200 [text-shadow:0_1px_3px_#000]">
                {bossName}
                {bossTraits.length > 0 && <span className="text-[11px]">{bossTraits.map((t) => t.icon).join(' ')}</span>}
              </span>
              <span className="text-[11px] text-stone-300 [text-shadow:0_1px_3px_#000]">
                원정대 피해 <b className="font-mono text-[15px] text-orange-300 tabular-nums">{st.total.toLocaleString('ko-KR')}</b>
              </span>
            </div>
          </button>

          {/* 아래 — 원정대원 목록(참가 순, 대난투 순위 행처럼 얼굴을 오른쪽에 크게). 지금 공격하는 행이 빛나고 화면 안으로 따라온다. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
            <div className="sticky top-0 z-10 flex items-center justify-between bg-stone-950 py-1.5 text-[10.5px] text-stone-500">
              <span>원정대원 {roster.length}명</span>
              <span>공격 · 피해 · 획득</span>
            </div>
            <ul className="overflow-hidden rounded-xl border border-stone-800">
              {roster.map((m, i) => {
                const fellR = st.fell[i];
                const isHit = !!hit && st.last![0] === i;
                const isStruck = !!struck && st.last![1] === i;
                const f = face(m.userId);
                const bits = isHit ? (weakBits[idx - 1] ?? 0) : 0;
                const slots = [1, 2, 4].filter((b) => (bits & b) !== 0);
                const down = fellR != null && !isStruck;
                return (
                  <li
                    key={m.userId}
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    className={`relative flex h-[50px] items-center overflow-hidden border-b border-stone-800/80 last:border-b-0 ${
                      isStruck ? 'bg-red-950/60' : isHit ? 'bg-orange-950/40' : 'bg-stone-900'
                    } ${down ? 'opacity-60' : ''}`}
                  >
                    {f.src ? (
                      <div className="pointer-events-none absolute inset-y-0 right-0 w-32">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.src} alt="" aria-hidden decoding="async" className={`absolute inset-0 h-full w-full ${down ? 'grayscale' : ''}`} style={meleeFaceCropStyle(f.box)} />
                      </div>
                    ) : null}
                    {/* 왼쪽에서 어두워지는 그라데이션 — 글자 자리 확보(대난투 행과 같은 방식) */}
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#1c1917_0%,#1c1917_50%,rgba(28,25,23,0.15)_100%)]" />
                    {isHit && <div className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-orange-400" />}
                    {isStruck && <div className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-red-500" />}
                    <div className="relative z-10 min-w-0 flex-1 px-2.5 leading-tight">
                      <span className="flex min-w-0 items-center gap-1 text-[12px] font-bold text-stone-50 [text-shadow:0_1px_2px_#000]">
                        <span className="truncate">{m.nickname}</span>
                        {isLeader(m.nickname) && <LeaderChip />}
                        {fellR != null && <span className="shrink-0 rounded bg-red-900/80 px-1 text-[8.5px] font-extrabold text-red-200">{fellR}R 쓰러짐</span>}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1 whitespace-nowrap text-[10px] text-stone-400 [text-shadow:0_1px_2px_#000]">
                        {m.guildName ? (
                          <GuildBadge emblemUrl={battle.guildEmblems?.[m.userId]?.url ?? null} emblemColor={battle.guildEmblems?.[m.userId]?.color ?? null} name={m.guildName} size={10} className="min-w-0 max-w-[72px]" />
                        ) : (
                          <span className="shrink-0">무소속</span>
                        )}
                        <span className="shrink-0 text-stone-600">·</span>
                        <span className="shrink-0">
                          공격 <b className="font-mono text-stone-200">{st.atk[i]}</b> · 피해{' '}
                          <b className={`font-mono ${isHit ? 'text-orange-300' : 'text-stone-200'}`}>{formatCompactKR(st.dmg[i]!)}</b>
                          {st.gotD[i]! > 0 || st.gotB[i]! > 0 ? (
                            <>
                              {' '}· <b className="text-orange-300">{[st.gotD[i]! > 0 ? `💎${st.gotD[i]}` : '', st.gotB[i]! > 0 ? `📦${st.gotB[i]}` : ''].filter(Boolean).join(' ')}</b>
                            </>
                          ) : null}
                        </span>
                        {/* 이번 공격의 약점 적중 — 두 부위 이상이면 금빛(보상 운이 좋아진 공격, 리뷰 R2) */}
                        {slots.length > 0 && (
                          <span
                            key={`w${idx}`}
                            className={`flex shrink-0 animate-wb-round items-center gap-0.5 rounded-full px-1.5 text-[10px] ${
                              slots.length >= 2 ? 'bg-orange-400 text-orange-50 ring-1 ring-amber-100 shadow-[0_0_10px_2px_rgba(249,115,22,0.6)]' : 'bg-orange-500/25 text-orange-200 ring-1 ring-orange-500/60'
                            }`}
                          >
                            약점
                            {slots.map((b) => (
                              <span key={b}>{b === 1 ? '⚔' : b === 2 ? '🛡' : '💍'}</span>
                            ))}
                          </span>
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {/* 끝난 뒤 — 일지 전체(결과 팝업을 닫고 다시 읽을 수 있게). */}
            {done && (
              <div className="mt-2 rounded-xl border border-stone-800 bg-stone-900/70 px-2.5 py-2">
                <p className="mb-1 text-[10.5px] text-stone-500">전투 일지</p>
                {lines.map((l) => (
                  <p key={l.key} className={`overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-snug ${l.kind === 'round' ? 'mt-1 text-center text-[10px] tracking-widest text-stone-500' : l.kind === 'boss' ? 'text-red-200' : 'text-stone-200'}`}>
                    {l.kind === 'atk' ? (
                      <>
                        ▶ {l.text} — <b className="font-mono text-orange-300">{formatCompactKR(l.dmg ?? 0)}</b>
                        {l.weak ? <b className="ml-1 text-orange-300">약점 적중{l.weak >= 2 ? ` ×${l.weak}` : ''}!</b> : null}
                        {l.loot ? <span className="ml-1 text-orange-200">⚑ {l.loot}</span> : null}
                      </>
                    ) : l.kind === 'boss' ? (
                      <>✦ {l.text}</>
                    ) : (
                      <>— {l.text} —</>
                    )}
                  </p>
                ))}
              </div>
            )}
          </div>
          {done ? (
            <div className="mx-4 mb-[calc(env(safe-area-inset-bottom,0px)+14px)] mt-1 flex shrink-0 gap-2">
              <button type="button" onClick={() => setResultDismissed(false)} className="flex-1 rounded-lg bg-orange-700 py-2.5 text-[12.5px] font-extrabold text-orange-50">
                결과 보기
              </button>
              <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-stone-700 py-2.5 text-[12.5px] font-bold text-stone-300">
                닫기
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIdx(events.length)}
              className="mx-4 mb-[calc(env(safe-area-inset-bottom,0px)+14px)] mt-1 shrink-0 rounded-lg border border-stone-700 py-2.5 text-[12.5px] font-bold text-stone-300"
            >
              건너뛰기
            </button>
          )}
        </>
      {resultOpen && (
        <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/70 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-[calc(env(safe-area-inset-top,0px)+40px)]" role="dialog" aria-label="전투 결과">
        <div className="flex max-h-full flex-col overflow-y-auto rounded-2xl border border-stone-700 bg-stone-900 px-4 pb-4 pt-4">
          {/* 결과 — 보스·페이즈 상승을 크게, 표는 아래 */}
          <div className="flex flex-col items-center text-center">
            <WorldBossSprite alt="" className="h-24 w-24" style={{ filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 12px rgba(249,115,22,0.5))' }} />
            <p className="text-[12px] text-stone-400">{battle.leaderNickname} 원정대 · {battle.finale.rounds}라운드</p>
            <p className="mt-1 text-[30px] font-black leading-tight text-orange-300">{battle.finale.totalDamage.toLocaleString('ko-KR')}</p>
            <p className="text-[11px] text-stone-500">원정대 피해</p>
            {moved > 0 ? (
              <p className="mt-2 animate-wb-round rounded-full bg-orange-500/15 px-3 py-1 text-[14px] font-extrabold text-orange-200 ring-1 ring-orange-500/50">
                {bossName} {battle.stageTo}페이즈까지 <span className="text-orange-300">+{moved}페이즈</span>
              </p>
            ) : (
              <p className="mt-2 text-[12px] text-stone-400">보스 {battle.stageTo}페이즈 그대로</p>
            )}
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-orange-950/50 px-3 py-2.5">
            <span className="text-[12px] text-stone-300">원정대 획득</span>
            <b className="text-[17px] text-orange-200">
              💎{battle.reward.diamond.toLocaleString('ko-KR')} 📦{battle.reward.boxes.toLocaleString('ko-KR')}
            </b>
            <span className="text-[10.5px] text-stone-500">각자 몫은 우편으로</span>
          </div>
          <table className="mt-3 w-full text-[11px]">
            <thead>
              <tr className="text-left text-stone-500">
                <th className="py-1 font-semibold">원정대원</th>
                <th className="py-1 text-right font-semibold">공격</th>
                <th className="py-1 text-right font-semibold">피해</th>
                <th className="py-1 text-right font-semibold">획득</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((m, r) => (
                <tr key={m.userId} className="border-t border-stone-800">
                  <td className="max-w-[150px] py-1.5">
                    <span className="flex min-w-0 items-center gap-1">
                      <span className={`font-mono ${r === 0 ? 'text-orange-300' : 'text-stone-600'}`}>{r + 1}</span>
                      <span className="truncate">{m.nickname}</span>
                      {isLeader(m.nickname) && <LeaderChip />}
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{st.atk[m.i]}</td>
                  <td className={`py-1.5 text-right font-mono tabular-nums ${r === 0 ? 'text-orange-300' : ''}`}>{formatCompactKR(st.dmg[m.i]!)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-orange-200">
                    {st.gotD[m.i]! > 0 || st.gotB[m.i]! > 0
                      ? [st.gotD[m.i]! > 0 ? `💎${st.gotD[m.i]}` : '', st.gotB[m.i]! > 0 ? `📦${st.gotB[m.i]}` : ''].filter(Boolean).join(' ')
                      : <span className="text-stone-600">꽝</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setFast(false);
                setResultDismissed(false);
                setIdx(0);
              }}
              className="flex-1 rounded-lg border border-stone-700 py-2.5 text-[12.5px] font-bold text-stone-300"
            >
              다시 보기
            </button>
            <button type="button" onClick={() => setResultDismissed(true)} className="flex-1 rounded-lg border border-stone-700 py-2.5 text-[12.5px] font-bold text-stone-300">
              일지 보기
            </button>
            <button type="button" onClick={onClose} className="flex-[1.4] rounded-lg bg-orange-700 py-2.5 text-[13px] font-extrabold text-orange-50">
              확인
            </button>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
