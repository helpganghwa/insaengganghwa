'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';

import { MELEE_REPLAY_ROUNDS, MELEE_HP_MULT } from '@/lib/game/balance';
import { assetUrl } from '@/lib/asset-versions';
import type { MeleeFinale, MeleeMyEvent } from '@/lib/db/schema/melee';

export type MeleeResultView = {
  participantCount: number;
  totalRounds: number;
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
  myCp: number;
  finale: MeleeFinale;
  rosterAvatars: (string | null)[];
};

/** 무대에 띄울 단일 전투. tgtMaxHp 있으면 타겟 HP 바 표시. */
type Fight = {
  round: number;
  atkName: string;
  atkAvatar: string | null;
  tgtName: string;
  tgtAvatar: string | null;
  dmg: number;
  hpAfter: number;
  tgtMaxHp?: number;
};

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

function boxSummary(b: { weapon: number; armor: number; accessory: number }): string {
  const parts: string[] = [];
  if (b.weapon) parts.push(`⚔️${b.weapon}`);
  if (b.armor) parts.push(`🛡️${b.armor}`);
  if (b.accessory) parts.push(`💍${b.accessory}`);
  return parts.join(' ');
}

// ── 로그(클릭 가능, 버튼) ──
function LogList({ children, empty }: { children: ReactNode; empty: string | false }) {
  if (empty) return <div className="px-2 py-6 text-center text-[11px] text-zinc-500">{empty}</div>;
  return <ul className="divide-y divide-zinc-900 text-[11px] leading-relaxed">{children}</ul>;
}

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
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full flex-wrap items-baseline gap-x-1 px-2.5 py-1.5 text-left transition hover:bg-zinc-900 active:bg-zinc-800"
      >
        <span className="text-amber-400">⚔️</span>
        <span className={`font-bold ${atk === me ? 'text-amber-300' : 'text-zinc-100'}`}>{atk}</span>
        <span className="text-zinc-500">→</span>
        <span className={`font-semibold ${tgt === me ? 'text-amber-300' : 'text-zinc-300'}`}>{tgt}</span>
        <span className="font-mono text-red-300">{dmg.toLocaleString()}</span>
        {killed ? (
          <span className="font-bold text-red-400">💀</span>
        ) : (
          <span className="font-mono text-emerald-400/80">HP {hp.toLocaleString()}</span>
        )}
      </button>
    </li>
  );
}

// ── 단일 전투 무대 ──
function Fighter({
  name,
  avatar,
  side,
  attacking,
  dead,
  hp,
  maxHp,
}: {
  name: string;
  avatar: string | null;
  side: 'l' | 'r';
  attacking: boolean;
  dead: boolean;
  hp?: number;
  maxHp?: number;
}) {
  const lunge = attacking ? (side === 'l' ? 'translate-x-2' : '-translate-x-2') : '';
  const pct = maxHp ? Math.max(0, Math.min(100, ((hp ?? 0) / maxHp) * 100)) : null;
  return (
    <div className="flex w-24 flex-col items-center gap-1">
      <div
        className={`relative h-20 w-16 transition-transform duration-200 ${
          dead ? 'opacity-30 grayscale' : ''
        } ${lunge}`}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt={name}
            className={`h-full w-full object-contain drop-shadow-[0_2px_5px_rgba(0,0,0,0.85)] ${
              side === 'r' ? '-scale-x-100' : ''
            }`}
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-zinc-300 drop-shadow">
            ⚔️
          </div>
        )}
        {/* 발밑 받침 그림자 — 배경 위 부유감 완화 */}
        <div className="pointer-events-none absolute -bottom-0.5 left-1/2 h-1.5 w-12 -translate-x-1/2 rounded-[50%] bg-black/50 blur-[3px]" />
      </div>
      <div className="max-w-[88px] truncate text-[11px] font-bold text-white drop-shadow">{name}</div>
      {pct !== null ? (
        <div className="h-1 w-14 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full ${pct > 0 ? 'bg-emerald-500' : 'bg-red-600'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function FightStage({
  fight,
  participantCount,
  onBack,
}: {
  fight: Fight;
  participantCount: number;
  onBack: () => void;
}) {
  const killed = fight.hpAfter <= 0;
  return (
    <div className="relative z-10 flex h-full flex-col">
      {/* 상단: 참가자 / 라운드 / 비움 */}
      <div className="grid grid-cols-3 items-center px-3 pt-1.5 text-[10px] font-semibold drop-shadow">
        <span className="text-left text-zinc-300">참가 {participantCount.toLocaleString()}</span>
        <span className="text-center text-amber-200">라운드 {fight.round.toLocaleString()}</span>
        <span />
      </div>
      {/* 중단: 아바타 vs 아바타 */}
      <div className="flex flex-1 items-center justify-center gap-3">
        <Fighter name={fight.atkName} avatar={fight.atkAvatar} side="l" attacking dead={false} />
        <div className="animate-[dmg-float_0.9s_ease-out] text-lg font-extrabold text-red-400 drop-shadow">
          -{fight.dmg.toLocaleString()}
        </div>
        <Fighter
          name={fight.tgtName}
          avatar={fight.tgtAvatar}
          side="r"
          attacking={false}
          dead={killed}
          hp={fight.hpAfter}
          maxHp={fight.tgtMaxHp}
        />
      </div>
      {/* 하단: 전투 로그 */}
      <div className="px-2 pb-1.5 text-center text-[11px] text-zinc-200 drop-shadow">
        <span className="font-bold">{fight.atkName}</span>
        <span className="text-zinc-400"> → </span>
        <span className="font-bold">{fight.tgtName}</span>{' '}
        <span className="font-mono text-red-300">{fight.dmg.toLocaleString()} 피해</span>
        {killed ? (
          <span className="font-bold text-red-400"> · 💀 쓰러졌다!</span>
        ) : (
          <span className="text-zinc-400">
            {' '}
            · HP <span className="font-mono text-emerald-300">{Math.max(0, fight.hpAfter).toLocaleString()}</span>
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onBack}
        className="absolute right-1.5 top-1.5 z-20 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-zinc-200 backdrop-blur-sm"
      >
        ↩ 랭킹
      </button>
    </div>
  );
}

// ── 랭킹 뷰(기본) ──
function RankingView({
  podium,
  participantCount,
}: {
  podium: MeleeResultView['podium'];
  participantCount: number;
}) {
  return (
    <div className="relative z-10 flex h-full flex-col justify-center gap-1 px-3">
      <div className="text-center text-[10px] font-semibold text-amber-200/90 drop-shadow">
        오늘의 대난투 · 참가 {participantCount.toLocaleString()}명
      </div>
      {podium.map((p) => (
        <div
          key={p.rank}
          className={`flex items-center gap-2 rounded-lg border px-2 py-1 backdrop-blur-sm ${
            p.rank === 1 ? 'border-amber-400/70 bg-amber-500/15' : 'border-zinc-600/50 bg-black/45'
          }`}
        >
          <span className="w-4 text-center text-base leading-none">{MEDAL[p.rank]}</span>
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md border border-zinc-600 bg-black/40">
            {p.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.avatarUrl}
                alt={p.nickname}
                className="h-full w-full object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">⚔️</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-bold text-white drop-shadow">{p.nickname}</div>
            <div className="text-[9px] text-zinc-300 drop-shadow">
              ⚔ {p.attackCount.toLocaleString()} · 🛡 {p.defenseCount.toLocaleString()}
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
  const {
    podium,
    me,
    finale,
    participantCount,
    totalRounds,
    myEvents,
    myNickname,
    myAvatar,
    myCp,
    rosterAvatars,
  } = view;
  const roster = finale.roster;
  const truncated = finale.events.length >= MELEE_REPLAY_ROUNDS;
  const finaleStart = totalRounds - finale.events.length; // 마지막 구간의 글로벌 라운드 오프셋

  const play = (f: Fight) => {
    setFight(f);
    setFightKey((k) => k + 1);
  };

  return (
    <div className="space-y-3">
      {/* 상단 고정 무대 — main 스크롤 기준 top-0(헤더 바로 아래) */}
      <div className="sticky top-0 z-10 -mx-4 -mt-4 overflow-hidden border-b border-amber-900/40">
        <div className="relative h-40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetUrl('/sprites/hub/melee.png')}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
            style={{ imageRendering: 'pixelated' }}
          />
          <div className="pointer-events-none absolute inset-0 bg-black/55" />
          {fight ? (
            <FightStage
              key={fightKey}
              fight={fight}
              participantCount={participantCount}
              onBack={() => setFight(null)}
            />
          ) : (
            <RankingView podium={podium} participantCount={participantCount} />
          )}
        </div>
      </div>

      {/* 내 순위/보상 */}
      {me ? (
        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-1.5 text-[12px]">
          <span>
            내 순위 <span className="font-mono font-extrabold text-amber-300">{me.rank}위</span>
            <span className="text-zinc-500"> / {participantCount.toLocaleString()}</span>
          </span>
          <Link href="/mail" className="text-zinc-300">
            {me.diamond > 0 ? `💎${me.diamond.toLocaleString()} ` : ''}
            {boxSummary(me.boxes)}
            <span className="ml-1 text-[10px] text-amber-300 underline">우편함</span>
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 px-3 py-1.5 text-center text-[11px] text-zinc-400">
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
            className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
              tab === t ? 'bg-amber-600 text-white' : 'text-zinc-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        <div className="px-2.5 py-1 text-[10px] text-zinc-500">
          로그를 누르면 위 무대에서 그 전투를 봅니다
          {tab === 'log' && truncated ? ` · 마지막 ${finale.events.length.toLocaleString()}전` : ''}
        </div>
        {tab === 'log' ? (
          <LogList empty={finale.events.length === 0 && '전투 기록이 없습니다.'}>
            {finale.events.map((e, i) => {
              const an = roster[e[0]]?.nickname ?? '?';
              const tn = roster[e[1]]?.nickname ?? '?';
              const tgtCp = roster[e[1]]?.cp ?? 0;
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
                      round: finaleStart + i + 1,
                      atkName: an,
                      atkAvatar: rosterAvatars[e[0]] ?? null,
                      tgtName: tn,
                      tgtAvatar: rosterAvatars[e[1]] ?? null,
                      dmg: e[2],
                      hpAfter: e[3],
                      tgtMaxHp: tgtCp > 0 ? tgtCp * MELEE_HP_MULT : undefined,
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
              const [role, opp, dmg, hp, round] = e;
              const atkName = role === 0 ? myNickname : opp;
              const tgtName = role === 0 ? opp : myNickname;
              // 타겟이 '나'(role 1)면 내 cp로 HP 바, 상대면 cp 미상 → 바 없음.
              const tgtMaxHp = role === 1 && myCp > 0 ? myCp * MELEE_HP_MULT : undefined;
              return (
                <LogLine
                  key={i}
                  atk={atkName}
                  tgt={tgtName}
                  dmg={dmg}
                  hp={hp}
                  me={myNickname}
                  onClick={() =>
                    play({
                      round: round ?? i + 1,
                      atkName,
                      atkAvatar: role === 0 ? myAvatar : null,
                      tgtName,
                      tgtAvatar: role === 0 ? null : myAvatar,
                      dmg,
                      hpAfter: hp,
                      tgtMaxHp,
                    })
                  }
                />
              );
            })}
          </LogList>
        )}
      </section>
    </div>
  );
}
