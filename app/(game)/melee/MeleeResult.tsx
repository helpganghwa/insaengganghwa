'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { MELEE_REPLAY_ROUNDS } from '@/lib/game/balance';
import { assetUrl } from '@/lib/asset-versions';
import type { MeleeFinale, MeleeMyEvent } from '@/lib/db/schema/melee';

export type MeleeResultView = {
  participantCount: number;
  championNickname: string;
  podium: {
    rank: number;
    nickname: string;
    avatarUrl: string | null;
    attackCount: number;
    defenseCount: number;
  }[];
  me: {
    rank: number;
    diamond: number;
    boxes: { weapon: number; armor: number; accessory: number };
  } | null;
  myEvents: MeleeMyEvent[];
  myNickname: string;
  myAvatar: string | null;
  finale: MeleeFinale;
  rosterAvatars: (string | null)[];
};

/** 무대에 띄울 단일 전투. */
type Fight = {
  atkName: string;
  atkAvatar: string | null;
  tgtName: string;
  tgtAvatar: string | null;
  dmg: number;
  hpAfter: number;
};

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
const FIGHT_MS = 1700; // 단일 전투 표시 후 랭킹뷰 복귀

function boxSummary(b: { weapon: number; armor: number; accessory: number }): string {
  const parts: string[] = [];
  if (b.weapon) parts.push(`⚔️${b.weapon}`);
  if (b.armor) parts.push(`🛡️${b.armor}`);
  if (b.accessory) parts.push(`💍${b.accessory}`);
  return parts.join(' ');
}

// ── 로그 ──
function LogLine({
  atk,
  tgt,
  dmg,
  hp,
  me,
  onClick,
}: {
  atk: string;
  tgt: string;
  dmg: number;
  hp: number;
  me?: string;
  onClick: () => void;
}) {
  const killed = hp <= 0;
  return (
    <li
      onClick={onClick}
      className="flex cursor-pointer flex-wrap items-baseline gap-x-1 px-2 py-1.5 transition hover:bg-zinc-900 active:bg-zinc-800"
    >
      <span className="text-amber-400">⚔️</span>
      <span className={`font-bold ${atk === me ? 'text-amber-300' : 'text-zinc-100'}`}>{atk}</span>
      <span className="text-zinc-500">의 공격 →</span>
      <span className={`font-semibold ${tgt === me ? 'text-amber-300' : 'text-zinc-300'}`}>{tgt}</span>
      <span className="font-mono text-red-300">{dmg.toLocaleString()} 피해</span>
      {killed ? (
        <span className="font-bold text-red-400">· 💀 쓰러졌다!</span>
      ) : (
        <span className="text-zinc-500">
          · HP <span className="font-mono text-emerald-300">{hp.toLocaleString()}</span>
        </span>
      )}
    </li>
  );
}

function LogList({ children, empty }: { children: ReactNode; empty: string | false }) {
  if (empty) return <div className="px-2 py-6 text-center text-[11px] text-zinc-500">{empty}</div>;
  return (
    <ul className="max-h-[46vh] divide-y divide-zinc-900 overflow-y-auto text-[11px] leading-relaxed">
      {children}
    </ul>
  );
}

// ── 단일 전투 무대(클릭 시) ──
function Fighter({
  name,
  avatar,
  side,
  attacking,
  dead,
}: {
  name: string;
  avatar: string | null;
  side: 'l' | 'r';
  attacking: boolean;
  dead: boolean;
}) {
  const lunge = attacking ? (side === 'l' ? 'translate-x-2' : '-translate-x-2') : '';
  return (
    <div className="flex w-24 flex-col items-center gap-1">
      <div
        className={`relative h-20 w-16 overflow-hidden rounded-xl border-2 transition-transform duration-200 ${
          dead ? 'border-zinc-700 opacity-30 grayscale' : 'border-amber-400/70'
        } ${lunge}`}
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
          <div className="flex h-full w-full items-center justify-center text-2xl text-zinc-500">⚔️</div>
        )}
        {dead ? (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-red-300">
            쓰러짐
          </div>
        ) : null}
      </div>
      <div className="max-w-[88px] truncate text-[11px] font-bold text-white drop-shadow">{name}</div>
    </div>
  );
}

function FightStage({ fight }: { fight: Fight }) {
  const killed = fight.hpAfter <= 0;
  return (
    <div className="relative z-10 flex h-full flex-col">
      <div className="flex flex-1 items-center justify-center gap-5">
        <Fighter name={fight.atkName} avatar={fight.atkAvatar} side="l" attacking dead={false} />
        <div className="animate-[dmg-float_0.9s_ease-out] text-xl font-extrabold text-red-400 drop-shadow">
          -{fight.dmg.toLocaleString()}
        </div>
        <Fighter name={fight.tgtName} avatar={fight.tgtAvatar} side="r" attacking={false} dead={killed} />
      </div>
      <div className="px-2 pb-2 text-center text-[11px] text-zinc-200 drop-shadow">
        <span className="font-bold">{fight.atkName}</span>
        <span className="text-zinc-400">의 공격 → </span>
        <span className="font-bold">{fight.tgtName}</span>{' '}
        <span className="font-mono text-red-300">{fight.dmg.toLocaleString()} 피해</span>{' '}
        {killed ? (
          <span className="font-bold text-red-400">· 💀 쓰러졌다!</span>
        ) : (
          <span className="text-zinc-400">
            · HP <span className="font-mono text-emerald-300">{Math.max(0, fight.hpAfter).toLocaleString()}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ── 랭킹 뷰(기본, 무대 배경 위) ──
function RankingView({
  podium,
  participantCount,
}: {
  podium: MeleeResultView['podium'];
  participantCount: number;
}) {
  return (
    <div className="relative z-10 flex h-full flex-col justify-center gap-1.5 px-3">
      <div className="text-center text-[10px] font-semibold text-amber-200/90 drop-shadow">
        오늘의 대난투 · 참가 {participantCount.toLocaleString()}명
      </div>
      {podium.map((p) => (
        <div
          key={p.rank}
          className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-1.5 backdrop-blur-sm ${
            p.rank === 1 ? 'border-amber-400/70 bg-amber-500/15' : 'border-zinc-600/50 bg-black/45'
          }`}
        >
          <span className="w-5 text-center text-lg leading-none">{MEDAL[p.rank]}</span>
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-zinc-600 bg-black/40">
            {p.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.avatarUrl}
                alt={p.nickname}
                className="h-full w-full object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-base text-zinc-500">⚔️</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-bold text-white drop-shadow">{p.nickname}</div>
            <div className="text-[9px] text-zinc-300 drop-shadow">
              ⚔ 공격 {p.attackCount.toLocaleString()} · 🛡 방어 {p.defenseCount.toLocaleString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MeleeResult({ view }: { view: MeleeResultView }) {
  const [tab, setTab] = useState<'log' | 'mine'>('log');
  const [fight, setFight] = useState<Fight | null>(null);
  const [fightKey, setFightKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    podium,
    me,
    finale,
    participantCount,
    myEvents,
    myNickname,
    myAvatar,
    rosterAvatars,
  } = view;
  const roster = finale.roster;
  const truncated = finale.events.length >= MELEE_REPLAY_ROUNDS;

  // 단일 전투 표시 → FIGHT_MS 후 랭킹뷰 복귀.
  const play = (f: Fight) => {
    setFight(f);
    setFightKey((k) => k + 1);
  };
  useEffect(() => {
    if (!fight) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFight(null), FIGHT_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [fightKey, fight]);

  return (
    <div className="space-y-3">
      {/* 상단 고정 무대 — 아레나 배경 위 랭킹뷰(기본) / 클릭 시 단일 전투 */}
      <div className="sticky top-12 z-10 -mx-4 overflow-hidden border-b border-amber-900/40">
        <div className="relative h-52">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetUrl('/sprites/hub/melee.png')}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
            style={{ imageRendering: 'pixelated' }}
          />
          <div className="pointer-events-none absolute inset-0 bg-black/55" />
          {fight ? <FightStage key={fightKey} fight={fight} /> : <RankingView podium={podium} participantCount={participantCount} />}
        </div>
      </div>

      {/* 내 순위/보상 — 컴팩트 */}
      {me ? (
        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-[12px]">
          <span>
            내 순위 <span className="font-mono font-extrabold text-amber-300">{me.rank}위</span>
            <span className="text-zinc-500"> / {participantCount.toLocaleString()}</span>
          </span>
          <span className="text-zinc-300">
            {me.diamond > 0 ? `💎${me.diamond.toLocaleString()} ` : ''}
            {boxSummary(me.boxes)}
            <span className="ml-1 text-[10px] text-zinc-500">우편</span>
          </span>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 px-3 py-2 text-center text-[11px] text-zinc-400">
          오늘 미참가 (강화 1회 이상이면 자동 참가)
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-1 rounded-xl border border-zinc-800 p-1">
        {(
          [
            ['log', '전체 전투'],
            ['mine', '내 전투'],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
              tab === t ? 'bg-amber-600 text-white' : 'text-zinc-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950">
        <div className="px-2 pt-1.5 text-[10px] text-zinc-500">
          로그를 누르면 위 무대에서 그 전투를 봅니다.
          {tab === 'log' && truncated ? ` · 마지막 ${finale.events.length.toLocaleString()}전` : ''}
        </div>
        {tab === 'log' ? (
          <LogList empty={finale.events.length === 0 && '전투 기록이 없습니다.'}>
            {finale.events.map((e, i) => {
              const an = roster[e[0]]?.nickname ?? '?';
              const tn = roster[e[1]]?.nickname ?? '?';
              return (
                <LogLine
                  key={i}
                  atk={an}
                  tgt={tn}
                  dmg={e[2]}
                  hp={e[3]}
                  me={myNickname}
                  onClick={() =>
                    play({
                      atkName: an,
                      atkAvatar: rosterAvatars[e[0]] ?? null,
                      tgtName: tn,
                      tgtAvatar: rosterAvatars[e[1]] ?? null,
                      dmg: e[2],
                      hpAfter: e[3],
                    })
                  }
                />
              );
            })}
          </LogList>
        ) : (
          <LogList
            empty={
              myEvents.length === 0 &&
              (me ? '전투 기록이 없습니다.' : '참가 시 내 전투가 표시됩니다.')
            }
          >
            {myEvents.map((e, i) => {
              const [role, opp, dmg, hp] = e;
              const atkName = role === 0 ? myNickname : opp;
              const tgtName = role === 0 ? opp : myNickname;
              const atkAvatar = role === 0 ? myAvatar : null;
              const tgtAvatar = role === 0 ? null : myAvatar;
              return (
                <LogLine
                  key={i}
                  atk={atkName}
                  tgt={tgtName}
                  dmg={dmg}
                  hp={hp}
                  me={myNickname}
                  onClick={() => play({ atkName, atkAvatar, tgtName, tgtAvatar, dmg, hpAfter: hp })}
                />
              );
            })}
          </LogList>
        )}
      </section>
    </div>
  );
}
