'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { MELEE_HP_MULT } from '@/lib/game/balance';
import { assetUrl } from '@/lib/asset-versions';
import type { MeleeFinale } from '@/lib/db/schema/melee';

/**
 * 대난투 전투 리플레이 애니메이션 — finale 이벤트를 한 전씩 아바타 대결로 재생.
 * 콜로세움 배경 + 공격자/타겟 아바타, 공격 모션·데미지·HP·쓰러짐 연출, 생존자 카운트.
 * 재생/일시정지·속도(1·2·4x)·스크럽. 결정론 로그라 모두 동일 장면.
 */
const SPEEDS = [1, 2, 4] as const;
const BASE_MS = 900; // 1x 한 전 표시 시간

function Fighter({
  name,
  avatar,
  hp,
  maxHp,
  side,
  attacking,
  hit,
  dead,
}: {
  name: string;
  avatar: string | null;
  hp: number;
  maxHp: number;
  side: 'l' | 'r';
  attacking: boolean;
  hit: boolean;
  dead: boolean;
}) {
  const pctHp = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const lunge = attacking ? (side === 'l' ? 'translate-x-3' : '-translate-x-3') : '';
  return (
    <div className="flex w-24 flex-col items-center gap-1">
      <div
        className={`relative h-24 w-20 overflow-hidden rounded-xl border-2 transition-transform duration-150 ${
          dead ? 'border-zinc-700 opacity-30 grayscale' : 'border-amber-400/70'
        } ${lunge} ${hit ? 'animate-[hit-shake_0.32s_ease-in-out]' : ''}`}
        style={{ background: 'rgba(0,0,0,0.4)' }}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt={name}
            className={`h-full w-full object-contain ${side === 'r' ? '-scale-x-100' : ''}`}
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-zinc-500">⚔️</div>
        )}
        {hit ? <div className="pointer-events-none absolute inset-0 bg-red-500/40" /> : null}
        {dead ? (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-red-300">
            쓰러짐
          </div>
        ) : null}
      </div>
      <div className="max-w-[88px] truncate text-[11px] font-bold text-white drop-shadow">{name}</div>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full ${pctHp > 0 ? 'bg-emerald-500' : 'bg-red-600'}`}
          style={{ width: `${pctHp}%`, transition: 'width 150ms' }}
        />
      </div>
    </div>
  );
}

export function MeleeReplay({
  finale,
  rosterAvatars,
}: {
  finale: MeleeFinale;
  rosterAvatars: (string | null)[];
}) {
  const { roster, events } = finale;
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = events.length;
  const maxHp = useMemo(() => roster.map((r) => Math.max(1, r.cp * MELEE_HP_MULT)), [roster]);

  // cur 시점 상태 — events[0..cur] 재생해 HP·탈락 누적.
  const frame = useMemo(() => {
    const hp = roster.map((_, i) => maxHp[i]!);
    const dead = new Array(roster.length).fill(false);
    for (let i = 0; i <= cur && i < total; i++) {
      const [, t, , hpAfter] = events[i]!;
      hp[t] = hpAfter;
      if (hpAfter <= 0) dead[t] = true;
    }
    const aliveCount = dead.filter((d) => !d).length;
    return { hp, dead, aliveCount };
  }, [cur, events, roster, maxHp, total]);

  // 자동 재생 — 마지막 도달 시 타이머 콜백에서 정지(effect 본문 setState 회피).
  useEffect(() => {
    if (!playing || total === 0 || cur >= total - 1) return;
    timer.current = setTimeout(() => {
      setCur((c) => Math.min(total - 1, c + 1));
      if (cur + 1 >= total - 1) setPlaying(false);
    }, BASE_MS / speed);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [playing, cur, speed, total]);

  if (total === 0) {
    return <div className="px-2 py-8 text-center text-[11px] text-zinc-500">재생할 전투가 없습니다.</div>;
  }

  const [ai, ti, dmg, hpAfter] = events[cur]!;
  const finished = cur >= total - 1 && !playing;
  const killed = hpAfter <= 0;
  const champRank = roster.find((r) => r.rank === 1);

  return (
    <div className="space-y-2 p-2">
      {/* 무대 */}
      <div className="relative h-52 overflow-hidden rounded-xl border border-amber-800/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl('/sprites/hub/melee.png')}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-black/45" />

        <div className="relative z-10 flex items-center justify-between px-2 pt-1.5 text-[10px] font-semibold drop-shadow">
          <span className="text-emerald-300">🛡 생존 {frame.aliveCount}명</span>
          <span className="text-zinc-300 tabular-nums">
            {cur + 1}/{total}전
          </span>
        </div>

        {/* 결투 */}
        <div className="relative z-10 flex h-[calc(100%-22px)] items-center justify-center gap-6">
          <Fighter
            name={roster[ai]?.nickname ?? '?'}
            avatar={rosterAvatars[ai] ?? null}
            hp={frame.hp[ai]!}
            maxHp={maxHp[ai]!}
            side="l"
            attacking
            hit={false}
            dead={frame.dead[ai]!}
          />
          <div className="flex flex-col items-center">
            <div key={cur} className="animate-[dmg-float_0.8s_ease-out] text-lg font-extrabold text-red-400 drop-shadow">
              -{dmg.toLocaleString()}
            </div>
            <div className="text-[9px] text-zinc-400">⚔</div>
          </div>
          <Fighter
            name={roster[ti]?.nickname ?? '?'}
            avatar={rosterAvatars[ti] ?? null}
            hp={frame.hp[ti]!}
            maxHp={maxHp[ti]!}
            side="r"
            attacking={false}
            hit={!killed}
            dead={frame.dead[ti]!}
          />
        </div>

        {finished && champRank ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 text-center">
            <div className="text-3xl">👑</div>
            <div className="mt-1 text-sm font-extrabold text-amber-300">우승 · {champRank.nickname}</div>
          </div>
        ) : null}
      </div>

      {/* 자막 — RPG 턴제 */}
      <div className="px-1 text-center text-[11px] leading-snug text-zinc-300">
        <span className="text-amber-400">⚔️ </span>
        <span className="font-bold text-zinc-100">{roster[ai]?.nickname}</span>
        <span className="text-zinc-500">의 공격 → </span>
        <span className="font-bold text-zinc-100">{roster[ti]?.nickname}</span>{' '}
        <span className="font-mono text-red-300">{dmg.toLocaleString()} 피해</span>{' '}
        {killed ? (
          <span className="font-bold text-red-400">· 💀 쓰러졌다!</span>
        ) : (
          <span className="text-zinc-500">
            · HP <span className="font-mono text-emerald-300">{Math.max(0, hpAfter).toLocaleString()}</span>
          </span>
        )}
      </div>

      {/* 컨트롤 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setCur((c) => Math.max(0, c - 1));
            setPlaying(false);
          }}
          className="rounded-lg bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={() => {
            if (cur >= total - 1) setCur(0);
            setPlaying((p) => !p);
          }}
          className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white"
        >
          {playing ? '⏸' : cur >= total - 1 ? '↺ 다시' : '▶'}
        </button>
        <button
          type="button"
          onClick={() => {
            setCur((c) => Math.min(total - 1, c + 1));
            setPlaying(false);
          }}
          className="rounded-lg bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
        >
          ⏭
        </button>
        <button
          type="button"
          onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]!)}
          className="rounded-lg bg-zinc-800 px-2 py-1 text-xs font-bold text-amber-300"
        >
          {speed}x
        </button>
        <input
          type="range"
          min={0}
          max={total - 1}
          value={cur}
          onChange={(e) => {
            setCur(Number(e.target.value));
            setPlaying(false);
          }}
          className="flex-1 accent-amber-500"
          aria-label="전투 진행"
        />
      </div>
    </div>
  );
}
