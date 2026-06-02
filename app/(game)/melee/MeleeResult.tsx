'use client';

import { useState } from 'react';

import { MELEE_REPLAY_ROUNDS } from '@/lib/game/balance';
import type { MeleeFinale, MeleeMyEvent } from '@/lib/db/schema/melee';

import { MeleeReplay } from './MeleeReplay';

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
  finale: MeleeFinale;
  rosterAvatars: (string | null)[];
};

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

function boxSummary(b: { weapon: number; armor: number; accessory: number }): string {
  const parts: string[] = [];
  if (b.weapon) parts.push(`⚔️${b.weapon}`);
  if (b.armor) parts.push(`🛡️${b.armor}`);
  if (b.accessory) parts.push(`💍${b.accessory}`);
  return parts.join(' ');
}

/** 전투 로그 — 스토리 형식. 동일 컴포넌트를 전체/내 전투 양쪽에서 사용. */
function StoryLog({
  events,
  roster,
  empty,
}: {
  events: MeleeFinale['events'];
  roster: MeleeFinale['roster'];
  empty: string;
}) {
  if (events.length === 0) {
    return <div className="px-2 py-6 text-center text-[11px] text-zinc-500">{empty}</div>;
  }
  return (
    <ul className="max-h-[58vh] divide-y divide-zinc-900 overflow-y-auto text-[11px] leading-relaxed">
      {events.map((e, i) => {
        const [ai, ti, dmg, hp] = e;
        const an = roster[ai]?.nickname ?? '?';
        const tn = roster[ti]?.nickname ?? '?';
        const killed = hp <= 0;
        return (
          <li key={i} className="flex flex-wrap items-baseline gap-x-1 px-2 py-1.5">
            <span className="text-amber-400">⚔️</span>
            <span className="font-bold text-zinc-100">{an}</span>
            <span className="text-zinc-500">의 공격 →</span>
            <span className="font-semibold text-zinc-300">{tn}</span>
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
      })}
    </ul>
  );
}

/** 내 전투 미니로그 — 본인 관점 스토리. role 0=내가 공격, 1=내가 피격. */
function MyStoryLog({ events, empty }: { events: MeleeMyEvent[]; empty: string }) {
  if (events.length === 0) {
    return <div className="px-2 py-6 text-center text-[11px] text-zinc-500">{empty}</div>;
  }
  return (
    <ul className="max-h-[58vh] divide-y divide-zinc-900 overflow-y-auto text-[11px] leading-relaxed">
      {events.map((e, i) => {
        const [role, opp, dmg, hp] = e;
        const killed = hp <= 0;
        const iAttacked = role === 0;
        return (
          <li key={i} className="flex flex-wrap items-baseline gap-x-1 px-2 py-1.5">
            {iAttacked ? (
              <>
                <span className="text-amber-400">⚔️</span>
                <span className="font-bold text-amber-200">나</span>
                <span className="text-zinc-500">의 공격 →</span>
                <span className="font-semibold text-zinc-300">{opp}</span>
                <span className="font-mono text-red-300">{dmg.toLocaleString()} 피해</span>
                {killed ? (
                  <span className="font-bold text-red-400">· 💀 {opp} 쓰러졌다!</span>
                ) : (
                  <span className="text-zinc-500">
                    · {opp} HP <span className="font-mono text-emerald-300">{hp.toLocaleString()}</span>
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-sky-400">🛡️</span>
                <span className="font-semibold text-zinc-300">{opp}</span>
                <span className="text-zinc-500">의 공격 →</span>
                <span className="font-bold text-amber-200">나</span>
                <span className="font-mono text-red-300">{dmg.toLocaleString()} 피해</span>
                {killed ? (
                  <span className="font-bold text-red-400">· 💀 내가 쓰러졌다!</span>
                ) : (
                  <span className="text-zinc-500">
                    · 내 HP <span className="font-mono text-emerald-300">{hp.toLocaleString()}</span>
                  </span>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function MeleeResult({ view }: { view: MeleeResultView }) {
  const [tab, setTab] = useState<'replay' | 'log' | 'mine'>('replay');
  const { podium, me, finale, participantCount, championNickname, myEvents, rosterAvatars } = view;
  const roster = finale.roster;
  const truncated = finale.events.length >= MELEE_REPLAY_ROUNDS;

  return (
    <div className="space-y-4">
      {/* 1~3위 랭킹 섹션 — 닉네임·아바타·공격/방어 횟수 */}
      <section className="rounded-2xl border border-amber-700/40 bg-gradient-to-b from-amber-950/30 to-zinc-950 p-3">
        <div className="text-center text-[11px] text-zinc-400">
          오늘의 대난투 · 참가 {participantCount.toLocaleString()}명
        </div>
        <ul className="mt-2 space-y-1.5">
          {podium.map((p) => (
            <li
              key={p.rank}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                p.rank === 1
                  ? 'border-amber-400/70 bg-amber-500/10'
                  : 'border-zinc-800 bg-zinc-900/40'
              }`}
            >
              <span className="w-5 text-center text-xl leading-none">{MEDAL[p.rank]}</span>
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-zinc-700 bg-black/40">
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.avatarUrl}
                    alt={p.nickname}
                    className="h-full w-full object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-lg text-zinc-500">
                    ⚔️
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold text-white">{p.nickname}</div>
                <div className="text-[10px] text-zinc-400">
                  ⚔ 공격 {p.attackCount.toLocaleString()} · 🛡 방어 {p.defenseCount.toLocaleString()}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* 내 순위 + 보상 — 컴팩트 1줄 */}
      {me ? (
        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-[12px]">
          <span>
            내 순위{' '}
            <span className="font-mono font-extrabold text-amber-300">{me.rank}위</span>
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
            ['replay', '리플레이'],
            ['log', '전체 로그'],
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
        {tab === 'replay' ? (
          <MeleeReplay finale={finale} rosterAvatars={rosterAvatars} />
        ) : tab === 'log' ? (
          <>
            {truncated ? (
              <div className="px-2 pt-1.5 text-[10px] text-zinc-500">
                마지막 {finale.events.length.toLocaleString()}전 · 👑 {championNickname}
              </div>
            ) : null}
            <StoryLog events={finale.events} roster={roster} empty="전투 기록이 없습니다." />
          </>
        ) : (
          <MyStoryLog
            events={myEvents}
            empty={me ? '전투 기록이 없습니다.' : '참가 시 내 전투가 표시됩니다.'}
          />
        )}
      </section>
    </div>
  );
}
