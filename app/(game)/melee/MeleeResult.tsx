'use client';

import { useEffect, useState } from 'react';
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

const clampPct = (v: number) => Math.max(0, Math.min(100, v));
/** 내 전투 상대(아바타 미상)·폴백용 기본 지급 아바타. */
const DEFAULT_AVATAR = '/sprites/default/male/south.png';

function boxSummary(b: { weapon: number; armor: number; accessory: number }): string {
  const parts: string[] = [];
  if (b.weapon) parts.push(`무기 ${b.weapon}`);
  if (b.armor) parts.push(`방어구 ${b.armor}`);
  if (b.accessory) parts.push(`장신구 ${b.accessory}`);
  return parts.join(' · ');
}

// ── 단일 전투 무대(레이드식 타격·HP 연출) ──
function Fighter({
  name,
  avatar,
  side,
  attacking,
  shake,
  hp,
  hpBefore,
  maxHp,
}: {
  name: string;
  avatar: string | null;
  side: 'l' | 'r';
  attacking: boolean;
  shake: boolean;
  hp?: number;
  hpBefore?: number;
  maxHp?: number;
}) {
  const dead = maxHp != null && (hp ?? 0) <= 0;
  // HP 바: 피격 전 → 후로 애니메이션(시각적 감소).
  const [pct, setPct] = useState(maxHp ? clampPct(((hpBefore ?? hp ?? 0) / maxHp) * 100) : 0);
  useEffect(() => {
    if (maxHp == null) return;
    const id = requestAnimationFrame(() => setPct(clampPct(((hp ?? 0) / maxHp) * 100)));
    return () => cancelAnimationFrame(id);
  }, [hp, maxHp]);

  const lunge = attacking ? (side === 'l' ? 'translate-x-2' : '-translate-x-2') : '';
  return (
    <div className="flex w-24 flex-col items-center gap-1">
      <div
        className={`relative h-28 w-24 transition-transform duration-200 ${dead ? 'opacity-30 grayscale' : ''} ${lunge} ${
          shake ? 'animate-hit-shake' : ''
        }`}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt={name}
            className={`h-full w-full object-contain object-bottom drop-shadow-[0_2px_5px_rgba(0,0,0,0.85)] ${
              side === 'r' ? '-scale-x-100' : ''
            }`}
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg font-extrabold text-zinc-400">
            {name.slice(0, 1)}
          </div>
        )}
        <div className="pointer-events-none absolute -bottom-0.5 left-1/2 h-1.5 w-14 -translate-x-1/2 rounded-[50%] bg-black/55 blur-[3px]" />
      </div>
      <div className="max-w-[92px] truncate text-[11px] font-bold text-white drop-shadow">{name}</div>
      {maxHp != null ? (
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-black/40">
          <div
            className={`h-full ${pct > 0 ? 'bg-emerald-500' : 'bg-red-600'}`}
            style={{ width: `${pct}%`, transition: 'width 650ms ease-out' }}
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
      {/* 피격 플래시(1회) */}
      <div className="animate-hit-flash pointer-events-none absolute inset-0 bg-red-500/70 mix-blend-screen" />
      {/* 상단: 참가자 / 라운드 / 비움 */}
      <div className="relative z-10 grid grid-cols-3 items-center px-3 pt-2 text-[10px] font-semibold drop-shadow">
        <span className="text-left text-zinc-200">참가 {participantCount.toLocaleString()}</span>
        <span className="text-center text-amber-200">라운드 {fight.round.toLocaleString()}</span>
        <span />
      </div>
      {/* 중단: 아바타 vs 아바타 + 플로팅 데미지 */}
      <div className="relative z-10 flex flex-1 items-center justify-center gap-2">
        <Fighter name={fight.atkName} avatar={fight.atkAvatar} side="l" attacking shake={false} />
        <div className="animate-dmg-float pointer-events-none font-mono text-2xl font-extrabold text-red-300 drop-shadow">
          {fight.dmg.toLocaleString()}
        </div>
        <Fighter
          name={fight.tgtName}
          avatar={fight.tgtAvatar}
          side="r"
          attacking={false}
          shake
          hp={fight.hpAfter}
          hpBefore={fight.hpAfter + fight.dmg}
          maxHp={fight.tgtMaxHp}
        />
      </div>
      {/* 하단: 전투 로그 */}
      <div className="relative z-10 px-2 pb-2 text-center text-[11px] text-zinc-100 drop-shadow">
        <span className="font-bold">{fight.atkName}</span>
        <span className="text-zinc-400"> → </span>
        <span className="font-bold">{fight.tgtName}</span>{' '}
        <span className="font-mono text-red-300">{fight.dmg.toLocaleString()} 피해</span>
        {killed ? (
          <span className="font-bold text-red-400"> · 쓰러짐!</span>
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
        ← 랭킹
      </button>
    </div>
  );
}

// ── 랭킹 뷰(기본) — 리더보드식 2·1·3 전신 ──
function RankingView({
  podium,
  participantCount,
}: {
  podium: MeleeResultView['podium'];
  participantCount: number;
}) {
  const byRank = new Map(podium.map((p) => [p.rank, p]));
  const slots = [
    { slot: 2, p: byRank.get(2) },
    { slot: 1, p: byRank.get(1) },
    { slot: 3, p: byRank.get(3) },
  ];
  return (
    <div className="relative z-10 flex h-full flex-col">
      <div className="pt-1.5 text-center text-[10px] font-semibold text-amber-200 text-pixel-outline">
        오늘의 대난투 · 참가 {participantCount.toLocaleString()}명
      </div>
      <div className="flex flex-1 items-end justify-center gap-0.5 px-1 pb-1">
        {slots.map(({ slot, p }) => {
          const first = slot === 1;
          return (
            <div
              key={slot}
              className={`flex min-w-0 flex-1 flex-col items-center self-stretch ${first ? 'z-10' : 'pt-3'}`}
            >
              <div className="flex items-center gap-0.5 pt-0.5">
                <span className="font-mono text-[11px] font-bold tabular-nums text-amber-300 text-pixel-outline">
                  #{slot}
                </span>
                <span className="max-w-[80px] truncate text-[11px] font-medium text-white text-pixel-outline">
                  {p?.nickname ?? '—'}
                </span>
              </div>
              <div className="relative w-full flex-1">
                {p?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.avatarUrl}
                    alt=""
                    aria-hidden
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-contain object-bottom"
                    style={{
                      imageRendering: 'pixelated',
                      transform: first ? 'scale(1.32)' : 'scale(1.08)',
                      transformOrigin: 'center bottom',
                      filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.6))',
                    }}
                  />
                ) : null}
              </div>
              <span className="pb-0.5 text-[9px] font-medium text-amber-100 text-pixel-outline">
                {p ? `공격 ${p.attackCount} · 방어 ${p.defenseCount}` : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 로그 라운드 카드 — ROUND divider + 공격(좌)/방어(우) 한 줄 ──
function RoundCard({
  round,
  atk,
  tgt,
  dmg,
  hp,
  me,
  onClick,
}: {
  round: number;
  atk: string;
  tgt: string;
  dmg: number;
  hp: number;
  me?: string;
  onClick: () => void;
}) {
  const killed = hp <= 0;
  const hl = (n: string) => (n === me ? 'text-amber-300' : 'text-zinc-100');
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="block w-full px-2.5 py-1 text-left transition hover:bg-zinc-900 active:bg-zinc-800"
      >
        {/* ROUND divider */}
        <div className="my-1 flex items-center gap-2">
          <div className="h-px flex-1 bg-zinc-800" />
          <span className="font-mono text-[9px] font-bold tracking-wider text-amber-400/90">
            {round.toLocaleString()} ROUND
          </span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>
        {/* 공격(좌) / 방어(우) */}
        <div className="flex items-baseline justify-between gap-2 text-[11px]">
          <span className="min-w-0 flex-1 truncate">
            <span className="text-amber-400/90">공격 </span>
            <span className={`font-bold ${hl(atk)}`}>{atk}</span>{' '}
            <span className="font-mono text-red-300">{dmg.toLocaleString()}</span>
          </span>
          <span className="min-w-0 flex-1 truncate text-right">
            {killed ? (
              <>
                <span className="text-zinc-500">방어 </span>
                <span className={`font-semibold ${hl(tgt)}`}>{tgt}</span>{' '}
                <span className="font-bold text-red-400">쓰러짐</span>
              </>
            ) : (
              <>
                <span className="text-sky-400/80">방어 </span>
                <span className={`font-semibold ${hl(tgt)}`}>{tgt}</span>{' '}
                <span className="font-mono text-emerald-300">HP {hp.toLocaleString()}</span>
              </>
            )}
          </span>
        </div>
      </button>
    </li>
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
  const finaleStart = totalRounds - finale.events.length;

  const play = (f: Fight) => {
    setFight(f);
    setFightKey((k) => k + 1);
  };

  // 최신 라운드가 위로(역순) 렌더.
  const logRows = finale.events
    .map((e, i) => ({ e, round: finaleStart + i + 1 }))
    .reverse();
  const myRows = myEvents.map((e, i) => ({ e, round: e[4] ?? i + 1 })).reverse();

  return (
    <div className="flex h-full flex-col">
      {/* 무대 — 헤더처럼 고정(스크롤·오버스크롤 영향 없음) */}
      <div className="relative h-60 shrink-0 overflow-hidden border-b border-amber-900/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl('/sprites/hub/melee.png')}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-black/45" />
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

      {/* 하단 — 내부 스크롤 영역 */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
        {me ? (
          <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-1.5 text-[12px]">
            <span>
              내 순위 <span className="font-mono font-extrabold text-amber-300">{me.rank}위</span>
              <span className="text-zinc-500"> / {participantCount.toLocaleString()}</span>
            </span>
            <Link href="/mail" className="text-zinc-300">
              {me.diamond > 0 ? `다이아 ${me.diamond.toLocaleString()} · ` : ''}
              {boxSummary(me.boxes)}
              <span className="ml-1 text-[10px] text-amber-300 underline">우편함</span>
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 px-3 py-1.5 text-center text-[11px] text-zinc-400">
            오늘 미참가 (강화 1회 이상이면 자동 참가)
          </div>
        )}

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
            로그를 누르면 위 무대에서 그 전투를 봅니다 (최신순)
            {tab === 'log' && truncated ? ` · 마지막 ${finale.events.length.toLocaleString()}전` : ''}
          </div>
          {tab === 'log' ? (
            logRows.length === 0 ? (
              <div className="px-2 py-6 text-center text-[11px] text-zinc-500">전투 기록이 없습니다.</div>
            ) : (
              <ul>
                {logRows.map(({ e, round }) => {
                  const an = roster[e[0]]?.nickname ?? '?';
                  const tn = roster[e[1]]?.nickname ?? '?';
                  const tgtCp = roster[e[1]]?.cp ?? 0;
                  return (
                    <RoundCard
                      key={round}
                      round={round}
                      atk={an}
                      tgt={tn}
                      dmg={e[2]}
                      hp={e[3]}
                      me={myNickname}
                      onClick={() =>
                        play({
                          round,
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
              </ul>
            )
          ) : myRows.length === 0 ? (
            <div className="px-2 py-6 text-center text-[11px] text-zinc-500">
              {me ? '전투 기록이 없습니다.' : '참가 시 내 전투가 표시됩니다.'}
            </div>
          ) : (
            <ul>
              {myRows.map(({ e, round }) => {
                const [role, opp, dmg, hp] = e;
                const atkName = role === 0 ? myNickname : opp;
                const tgtName = role === 0 ? opp : myNickname;
                const tgtMaxHp = role === 1 && myCp > 0 ? myCp * MELEE_HP_MULT : undefined;
                return (
                  <RoundCard
                    key={round}
                    round={round}
                    atk={atkName}
                    tgt={tgtName}
                    dmg={dmg}
                    hp={hp}
                    me={myNickname}
                    onClick={() =>
                      play({
                        round,
                        atkName,
                        atkAvatar: role === 0 ? myAvatar ?? DEFAULT_AVATAR : DEFAULT_AVATAR,
                        tgtName,
                        tgtAvatar: role === 0 ? DEFAULT_AVATAR : myAvatar ?? DEFAULT_AVATAR,
                        dmg,
                        hpAfter: hp,
                        tgtMaxHp,
                      })
                    }
                  />
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
