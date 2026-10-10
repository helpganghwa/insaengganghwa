'use client';

/**
 * 월드보스 전투 재생(docs/WORLD-BOSS.md §3·§9) — 저장된 전투 기록(finale)을 한 칸씩 보여 준다.
 * 2026-10-08 리뷰 반영: 화면 가운데 배치(아래 절반이 비었다), 공격 = 보스 흔들림 + 피해 숫자, 쓰러짐 = 붉은 번쩍임 + 그 칸 회색,
 * 라운드가 바뀌면 큰 라운드 표시. 공격마다 뽑은 보상(복권)이 튀어나오고, 큰 당첨(💎300+ · 📦90+)은 글자 없이
 * 효과로만 강조한다(금빛 번쩍임·광선·크게 — 2026-10-08 사용자: '대박!' 같은 텍스트 금지).
 * 탭하면 2.5배속, 건너뛰기로 바로 결과. 결과는 서버가 출발 순간 정한 그대로라 재생만 한다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { GuildBadge } from '@/components/GuildBadge';
import { WorldBossBackdrop } from '@/components/WorldBossBackdrop';
import { WorldBossSprite } from '@/components/WorldBossSprite';
import { assetUrl } from '@/lib/asset-versions';
import { worldBossBgEmberUrl } from '@/lib/game/world-boss/bosses';
import { formatCompactKR } from '@/lib/ui/format-number';
import type { WorldBossBattle } from '@/lib/game/world-boss/view-types';

import { Avatar } from '../../friends/Avatar';

const STEP_ATTACK_MS = 420;
const STEP_FALL_MS = 900;

export function WorldBossReplay({
  battle,
  bossName,
  bgSrc,
  onClose,
}: {
  battle: WorldBossBattle;
  bossName: string;
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

  const ranked = useMemo(() => roster.map((m, i) => ({ ...m, i })).sort((a, b) => st.dmg[b.i]! - st.dmg[a.i]!), [roster, st.dmg]);
  const moved = battle.stageTo - battle.stageFrom;
  const struck = st.last && st.last[0] < 0;
  const hit = st.last && st.last[0] >= 0;
  const face = (userId: string) => battle.avatars?.[userId] ?? { src: null, box: null };

  // 대원이 칠 때 보스 흔들림 — Web Animations로 그 자리에서만 흔들어 대기 애니(띠)가 처음으로 돌아가지 않게 한다.
  const shakeRef = useRef<HTMLDivElement>(null);
  // 목록 — 지금 공격하는(또는 쓰러지는) 대원 줄을 화면 안으로.
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
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

  return (
    <div className="fixed inset-0 z-50 mx-auto flex w-full max-w-[390px] flex-col bg-stone-950 text-stone-100" role="dialog" aria-label="원정대 전투">
      {!done ? (
        <>
          {/* 위 — 무대(배경 + 보스). 탭하면 빠르게. 글자는 어두운 바탕 위에만 둬 숲 배경에서도 읽힌다(리뷰 R1). */}
          <button
            type="button"
            className="relative h-[46%] min-h-[290px] shrink-0 overflow-hidden text-left"
            onClick={() => setFast((f) => !f)}
            aria-label="빠르게 보기"
          >
            <WorldBossBackdrop bgSrc={bgSrc} emberSrc={assetUrl(worldBossBgEmberUrl())} className="opacity-85" />
            <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(9,9,11,0.75)_0%,transparent_20%,transparent_70%,#09090b_100%)]" />
            {/* 보스가 칠 때 가장자리만 붉게 물든다(전체를 덮으면 분홍으로 튐 — 2026-10-09) */}
            {struck && <span key={`f${idx}`} className="wb-vignette pointer-events-none absolute inset-0 animate-wb-flash" />}
            {hit && st.lastDrop && (st.lastDrop[0] >= 300 || st.lastDrop[1] >= 90) && (
              <span key={`fj${idx}`} className="pointer-events-none absolute inset-0 animate-wb-flash bg-orange-300/35" />
            )}
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
            <div className="absolute left-1/2 top-[52%] h-[170px] w-[170px] -translate-x-1/2 -translate-y-1/2">
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.22),transparent_65%)]" />
              {/* 보스 — 대기 애니는 계속 돌고, 대원이 치면 흔들림(다시 붙이지 않아 대기 애니가 끊기지 않는다),
                  보스가 치면 다가오기 + 불씨 플레어(WorldBossSprite attack) */}
              <div ref={shakeRef} className="relative h-full w-full">
                <WorldBossSprite
                  alt={bossName}
                  attack={struck ? idx : null}
                  className="h-full w-full"
                  style={{ filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000) drop-shadow(0 0 16px rgba(249,115,22,0.45))' }}
                />
              </div>
              {/* 이번 공격에서 나온 보상 — 큰 당첨은 글자 없이 효과로만(금빛 광선 + 번쩍임 + 크게) */}
              {hit && st.lastDrop && (st.lastDrop[0] >= 300 || st.lastDrop[1] >= 90) && (
                <span key={`j${idx}`} className="pointer-events-none absolute -inset-10 animate-wb-jackpot rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(249,115,22,0.55)_20deg,transparent_40deg,transparent_60deg,rgba(249,115,22,0.55)_80deg,transparent_100deg,transparent_120deg,rgba(249,115,22,0.55)_140deg,transparent_160deg,transparent_180deg,rgba(249,115,22,0.55)_200deg,transparent_220deg,transparent_240deg,rgba(249,115,22,0.55)_260deg,transparent_280deg,transparent_300deg,rgba(249,115,22,0.55)_320deg,transparent_340deg)]" />
              )}
              {hit && st.last && (
                <span key={`d${idx}`} className="absolute left-1/2 top-2 -translate-x-1/2 animate-wb-float whitespace-nowrap text-[24px] font-black text-white [text-shadow:0_0_8px_#ea580c,0_1px_2px_#000,0_0_2px_#000]">
                  {formatCompactKR(st.last[2])}
                </span>
              )}
              {hit && st.lastDrop && (st.lastDrop[0] > 0 || st.lastDrop[1] > 0) && (
                <span
                  key={`g${idx}`}
                  className={`absolute left-1/2 top-12 -translate-x-1/2 animate-wb-round whitespace-nowrap rounded-full px-2.5 py-0.5 font-black ${
                    st.lastDrop[0] >= 300 || st.lastDrop[1] >= 90
                      ? 'bg-gradient-to-r from-orange-300 via-amber-200 to-orange-400 text-[19px] text-orange-50 shadow-[0_0_24px_6px_rgba(249,115,22,0.85)] ring-2 ring-amber-100'
                      : 'bg-black/70 text-[13px] text-orange-200'
                  }`}
                >
                  {st.lastDrop[0] > 0 ? `💎${st.lastDrop[0].toLocaleString('ko-KR')}` : `📦${st.lastDrop[1]}`}
                </span>
              )}
            </div>
            {/* 보스 이름 · 원정대 피해 — 무대 아래쪽 어두운 띠 위 */}
            <div className="absolute inset-x-0 bottom-2 z-10 flex items-baseline justify-between px-3">
              <span className="text-[14px] font-extrabold text-orange-200 [text-shadow:0_1px_3px_#000]">{bossName}</span>
              <span className="text-[11px] text-stone-300 [text-shadow:0_1px_3px_#000]">
                원정대 피해 <b className="font-mono text-[16px] text-orange-300 tabular-nums">{st.total.toLocaleString('ko-KR')}</b>
              </span>
            </div>
          </button>

          {/* 아래 — 원정대원 목록(참가 순). 지금 공격하는 대원 줄이 빛나고 화면 안으로 따라온다. */}
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
            <div className="sticky top-0 z-10 flex items-center bg-stone-950 py-1.5 text-[10.5px] text-stone-500">
              <span className="flex-1">원정대원 {roster.length}명</span>
              <span className="w-10 text-right">공격</span>
              <span className="w-16 text-right">피해</span>
              <span className="w-16 text-right">획득</span>
            </div>
            {roster.map((m, i) => {
              const fellR = st.fell[i];
              const isHit = !!hit && st.last![0] === i;
              const isStruck = !!struck && st.last![1] === i;
              const f = face(m.userId);
              const bits = isHit ? (weakBits[idx - 1] ?? 0) : 0;
              const slots = [1, 2, 4].filter((b) => (bits & b) !== 0);
              return (
                <div
                  key={m.userId}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  className={`mb-1 flex items-center gap-2 rounded-lg border px-2 py-1.5 transition ${
                    isStruck ? 'border-red-500 bg-red-950/70' : isHit ? 'border-orange-400 bg-orange-900/40' : 'border-stone-800 bg-stone-900'
                  } ${fellR != null && !isStruck ? 'opacity-45' : ''}`}
                >
                  {f.src ? (
                    <Avatar src={f.src} box={f.box} size={`h-8 w-8 shrink-0 rounded-full bg-stone-800 ${fellR != null && !isStruck ? 'grayscale' : ''}`} />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-800 text-[12px] font-black">{m.nickname.slice(0, 1)}</span>
                  )}
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[12px] font-bold">
                      <span>
                        {m.nickname === battle.leaderNickname && <span className="mr-0.5 text-orange-300">★</span>}
                        {m.nickname}
                      </span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1 text-[10px] text-stone-500">
                      {fellR != null ? (
                        <span className="truncate text-red-300">{fellR}라운드에 쓰러짐</span>
                      ) : m.guildName ? (
                        <GuildBadge emblemUrl={battle.guildEmblems?.[m.userId]?.url ?? null} emblemColor={battle.guildEmblems?.[m.userId]?.color ?? null} name={m.guildName} size={10} className="min-w-0" />
                      ) : (
                        <span className="truncate">무소속</span>
                      )}
                      {/* 이번 공격의 약점 적중 — 두 부위 이상이면 금빛(보상 운이 좋아진 공격, 리뷰 R2) */}
                      {slots.length > 0 && (
                        <span
                          key={`w${idx}`}
                          className={`flex shrink-0 animate-wb-round items-center gap-0.5 rounded-full px-1.5 text-[11px] ${
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
                  </span>
                  <span className="w-10 text-right font-mono text-[11px] tabular-nums text-stone-400">{st.atk[i]}</span>
                  <span className={`w-16 text-right font-mono text-[11.5px] tabular-nums ${isHit ? 'font-bold text-orange-300' : 'text-stone-200'}`}>{formatCompactKR(st.dmg[i]!)}</span>
                  <span className="w-16 truncate text-right text-[10.5px] font-bold text-orange-300">
                    {st.gotD[i]! > 0 ? `💎${st.gotD[i]}` : ''}
                    {st.gotD[i]! > 0 && st.gotB[i]! > 0 ? ' ' : ''}
                    {st.gotB[i]! > 0 ? `📦${st.gotB[i]}` : ''}
                    {st.gotD[i]! === 0 && st.gotB[i]! === 0 ? <span className="font-normal text-stone-600">-</span> : null}
                  </span>
                </div>
              );
            })}
            <p className="mt-1 text-center text-[10px] text-stone-500">살아 있는 원정대원이 모두 한 번씩 공격하고, 보스가 한 명을 쓰러뜨려요.</p>
          </div>
          <button
            type="button"
            onClick={() => setIdx(events.length)}
            className="mx-4 mb-[calc(env(safe-area-inset-bottom,0px)+14px)] mt-1 shrink-0 rounded-lg border border-stone-700 py-2.5 text-[12.5px] font-bold text-stone-300"
          >
            건너뛰기
          </button>
        </>
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+16px)]">
          {/* 결과 — 보스·단계 상승을 크게, 표는 아래 */}
          <div className="flex flex-col items-center text-center">
            <WorldBossSprite alt="" className="h-24 w-24" style={{ filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 12px rgba(249,115,22,0.5))' }} />
            <p className="text-[12px] text-stone-400">{battle.leaderNickname} 원정대 · {battle.finale.rounds}라운드</p>
            <p className="mt-1 text-[30px] font-black leading-tight text-orange-300">{battle.finale.totalDamage.toLocaleString('ko-KR')}</p>
            <p className="text-[11px] text-stone-500">원정대 피해</p>
            {moved > 0 ? (
              <p className="mt-2 animate-wb-round rounded-full bg-orange-500/15 px-3 py-1 text-[14px] font-extrabold text-orange-200 ring-1 ring-orange-500/50">
                {bossName} {battle.stageTo}단계까지 <span className="text-orange-300">+{moved}단계</span>
              </p>
            ) : (
              <p className="mt-2 text-[12px] text-stone-400">보스 {battle.stageTo}단계 그대로</p>
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
                  <td className="max-w-[140px] truncate py-1.5">
                    <span className={`mr-1 font-mono ${r === 0 ? 'text-orange-300' : 'text-stone-600'}`}>{r + 1}</span>
                    {m.nickname}
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
          <span className="flex-1" />
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setFast(false);
                setIdx(0);
              }}
              className="flex-1 rounded-lg border border-stone-700 py-2.5 text-[12.5px] font-bold text-stone-300"
            >
              다시 보기
            </button>
            <button type="button" onClick={onClose} className="flex-[2] rounded-lg bg-orange-700 py-2.5 text-[13px] font-extrabold text-orange-50">
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
