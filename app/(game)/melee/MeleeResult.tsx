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

/** 내 순위·보상 칩 — 무대 하단에 반투명 오버레이. 탭하면 우편함(상세 보상). */
function MyRankChip({ me }: { me: MeleeResultView['me'] }) {
  if (!me) {
    return (
      <div className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[11px] font-medium text-zinc-300 ring-1 ring-zinc-700/50 backdrop-blur-sm text-pixel-outline">
        오늘 미참가
      </div>
    );
  }
  const totalBoxes = me.boxes.weapon + me.boxes.armor + me.boxes.accessory;
  const reward = [
    me.diamond > 0 ? `다이아 ${me.diamond.toLocaleString()}` : null,
    totalBoxes > 0 ? `상자 ${totalBoxes}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link
      href="/mail"
      className="absolute bottom-2 left-1/2 z-20 inline-flex max-w-[92%] -translate-x-1/2 items-center gap-1.5 truncate rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-zinc-100 ring-1 ring-amber-700/40 backdrop-blur-sm text-pixel-outline"
    >
      <span>
        내 순위 <span className="font-mono font-extrabold text-amber-300">{me.rank}위</span>
      </span>
      {reward ? <span className="text-zinc-300">· {reward}</span> : null}
      <span className="text-[10px] text-amber-300/90">›</span>
    </Link>
  );
}

/** 잔여 HP 비율별 게이지 색상(녹→황→주→적). */
function hpColor(pct: number): string {
  if (pct > 55) return 'bg-emerald-500';
  if (pct > 30) return 'bg-amber-400';
  if (pct > 0) return 'bg-orange-500';
  return 'bg-red-700';
}

// ── 단일 전투 무대(레이드식 타격·HP 연출) ──
//  공격/방어 라벨·이름·HP바를 양쪽 모두 고정 높이로 둬 두 파이터 높이를 맞춘다.
function Fighter({
  name,
  avatar,
  side,
  role,
  shake,
  dmg,
  hp,
  hpBefore,
  maxHp,
}: {
  name: string;
  avatar: string | null;
  side: 'l' | 'r';
  role: 'atk' | 'def';
  shake: boolean;
  /** 이 캐릭터 머리 위로 띄울 피해량(타겟에만). */
  dmg?: number;
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

  const attacking = role === 'atk';
  const lunge = attacking ? (side === 'l' ? 'translate-x-2' : '-translate-x-2') : '';
  return (
    <div className="flex w-32 flex-col items-center gap-1">
      {/* 공격/방어 라벨(머리 위) — 고정 높이 */}
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-pixel-outline ${
          attacking ? 'bg-amber-600/80 text-white' : 'bg-sky-700/80 text-white'
        }`}
      >
        {attacking ? '공격' : '방어'}
      </span>
      <div
        className={`relative h-44 w-32 transition-transform duration-200 ${dead ? 'opacity-30 grayscale' : ''} ${lunge} ${
          shake ? 'animate-hit-shake' : ''
        }`}
      >
        {/* 피해량 — 타겟 머리 위 정중앙에서 떠오름 */}
        {dmg != null ? (
          <div className="animate-dmg-float pointer-events-none absolute left-1/2 top-2 z-20 font-mono text-xl font-extrabold text-red-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            -{dmg.toLocaleString()}
          </div>
        ) : null}
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
          <div className="flex h-full w-full items-center justify-center text-2xl font-extrabold text-zinc-400">
            {name.slice(0, 1)}
          </div>
        )}
        <div className="pointer-events-none absolute -bottom-0.5 left-1/2 h-2 w-20 -translate-x-1/2 rounded-[50%] bg-black/55 blur-[3px]" />
      </div>
      <div className="max-w-[120px] truncate text-[12px] font-bold text-white drop-shadow">{name}</div>
      {/* HP바 — 양쪽 동일 높이 확보(공격자는 빈 자리 placeholder). */}
      {maxHp != null ? (
        <div className="h-2 w-24 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-black/40">
          <div
            className={`h-full ${hpColor(pct)}`}
            style={{ width: `${pct}%`, transition: 'width 650ms ease-out' }}
          />
        </div>
      ) : (
        <div className="h-2 w-24" />
      )}
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
  // 판타지 내레이션 — 한 줄로 전투를 묘사.
  const narration = killed
    ? `${fight.atkName}의 일격이 ${fight.tgtName}을(를) 꿰뚫는다. ${fight.dmg.toLocaleString()}의 치명타 — ${fight.tgtName}, 모래 위에 무너지다.`
    : `${fight.atkName}, ${fight.tgtName}에게 ${fight.dmg.toLocaleString()}의 피해를 새긴다. 남은 생명력 ${Math.max(0, fight.hpAfter).toLocaleString()}, 아직 쓰러지지 않는다.`;
  return (
    <div className="relative z-10 flex h-full flex-col">
      {/* 피격 플래시(1회) */}
      <div className="animate-hit-flash pointer-events-none absolute inset-0 bg-red-500/70 mix-blend-screen" />
      {/* 상단: 참가자 / ROUND / 비움 */}
      <div className="relative z-10 grid grid-cols-3 items-center px-3 pt-2 text-[10px] font-semibold drop-shadow">
        <span className="text-left text-zinc-200">참가 {participantCount.toLocaleString()}</span>
        <span className="text-center font-mono tracking-wider text-amber-200">
          {fight.round.toLocaleString()} ROUND
        </span>
        <span />
      </div>
      {/* 중단: 화면 2분할 — 각 절반 중앙에 파이터 배치 */}
      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-2 items-center overflow-hidden">
        <div className="flex justify-center">
          <Fighter name={fight.atkName} avatar={fight.atkAvatar} side="l" role="atk" shake={false} />
        </div>
        <div className="flex justify-center">
          <Fighter
            name={fight.tgtName}
            avatar={fight.tgtAvatar}
            side="r"
            role="def"
            shake
            dmg={fight.dmg}
            hp={fight.hpAfter}
            hpBefore={fight.hpAfter + fight.dmg}
            maxHp={fight.tgtMaxHp}
          />
        </div>
      </div>
      {/* 하단: 판타지 내레이션(잘리지 않게 고정) */}
      <div className="relative z-10 shrink-0 px-3 pb-2.5 text-center text-[11px] italic leading-snug text-zinc-100 drop-shadow">
        {narration}
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
      {/* items-end + 동일 높이 아바타 박스 + object-bottom → 발끝(바닥선) 통일. #1만 scale로 확대. */}
      {/* pb-9: 하단 내 순위 칩과 겹치지 않게 시상대를 위로 띄움. */}
      <div className="flex flex-1 items-end justify-center gap-0.5 px-1 pb-9">
        {slots.map(({ slot, p }) => {
          const first = slot === 1;
          return (
            <div key={slot} className={`flex w-1/3 flex-col items-center ${first ? 'z-10' : ''}`}>
              <div className="flex items-center gap-0.5">
                <span className="font-mono text-[11px] font-bold tabular-nums text-amber-300 text-pixel-outline">
                  #{slot}
                </span>
                <span className="max-w-[78px] truncate text-[11px] font-medium text-white text-pixel-outline">
                  {p?.nickname ?? '—'}
                </span>
              </div>
              <div className="relative h-32 w-full">
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
                      transform: first ? 'scale(1.55)' : 'scale(1.2)',
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

// ── 로그 라운드 카드 — ROUND divider + 공격(좌)/방어(우) 말풍선(턴제 PVP) ──
function RoundCard({
  round,
  atk,
  tgt,
  dmg,
  hp,
  tgtRank,
  me,
  onClick,
}: {
  round: number;
  atk: string;
  tgt: string;
  dmg: number;
  hp: number;
  /** 탈락 시 그 타겟의 최종 등수(있으면 "N위 기록" 표기). */
  tgtRank?: number;
  me?: string;
  onClick: () => void;
}) {
  const killed = hp <= 0;
  const hl = (n: string) => (n === me ? 'text-amber-300' : 'text-white');
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="block w-full px-2.5 py-1.5 text-left transition hover:bg-zinc-900 active:bg-zinc-800"
      >
        {/* ROUND divider */}
        <div className="mb-1.5 flex items-center gap-2">
          <div className="h-px flex-1 bg-zinc-800" />
          <span className="font-mono text-[9px] font-bold tracking-wider text-amber-400/90">
            {round.toLocaleString()} ROUND
          </span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>
        {/* 공격(좌) 말풍선 */}
        <div className="flex justify-start">
          <div className="max-w-[80%] truncate rounded-xl rounded-bl-sm bg-amber-950/40 px-2.5 py-1 text-[11px] ring-1 ring-amber-900/40">
            <span className="text-amber-400/90">공격 </span>
            <span className={`font-bold ${hl(atk)}`}>{atk}</span>
            <span className="text-zinc-400"> · </span>
            <span className="font-mono text-red-300">{dmg.toLocaleString()}</span>
            <span className="text-zinc-400"> 피해</span>
          </div>
        </div>
        {/* 방어(우) 말풍선 */}
        <div className="mt-1 flex justify-end">
          <div className="max-w-[80%] truncate rounded-xl rounded-br-sm bg-sky-950/40 px-2.5 py-1 text-right text-[11px] ring-1 ring-sky-900/40">
            <span className="text-sky-400/80">방어 </span>
            <span className={`font-bold ${hl(tgt)}`}>{tgt}</span>
            {killed ? (
              <span className="font-bold text-red-400">
                {' '}
                · 쓰러짐{tgtRank ? ` · ${tgtRank.toLocaleString()}위 기록` : ''}
              </span>
            ) : (
              <span className="text-zinc-300">
                <span className="text-zinc-400"> · 남은 체력 </span>
                <span className="font-mono text-emerald-300">{Math.max(0, hp).toLocaleString()}</span>
              </span>
            )}
          </div>
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
      <div className="relative h-80 shrink-0 overflow-hidden border-b border-amber-900/50">
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
        {/* 내 순위·보상 — 무대 하단 반투명 칩(스크롤 영역 차지 0). 랭킹 뷰일 때만. */}
        {!fight ? <MyRankChip me={me} /> : null}
      </div>

      {/* 하단 — 내부 스크롤 영역 */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
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
                  const tgtRank = roster[e[1]]?.rank;
                  return (
                    <RoundCard
                      key={round}
                      round={round}
                      atk={an}
                      tgt={tn}
                      dmg={e[2]}
                      hp={e[3]}
                      tgtRank={e[3] <= 0 ? tgtRank : undefined}
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
                // 내가 타겟이고 탈락한 라운드면 내 최종 등수를 기록 표기(상대 탈락 등수는 미상).
                const tgtRank = role === 1 && hp <= 0 ? me?.rank : undefined;
                return (
                  <RoundCard
                    key={round}
                    round={round}
                    atk={atkName}
                    tgt={tgtName}
                    dmg={dmg}
                    hp={hp}
                    tgtRank={tgtRank}
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
