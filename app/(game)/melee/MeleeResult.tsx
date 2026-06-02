'use client';

import { useState } from 'react';

import type { MeleeFinale } from '@/lib/db/schema/melee';

export type MeleeResultView = {
  participantCount: number;
  championNickname: string;
  podium: { rank: number; nickname: string; cp: number }[];
  me: {
    rank: number;
    diamond: number;
    boxes: { weapon: number; armor: number; accessory: number };
    killerNickname: string | null;
  } | null;
  myKills: { rank: number; nickname: string }[];
  finale: MeleeFinale;
};

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

function boxSummary(b: { weapon: number; armor: number; accessory: number }): string {
  const parts: string[] = [];
  if (b.weapon) parts.push(`⚔️${b.weapon}`);
  if (b.armor) parts.push(`🛡️${b.armor}`);
  if (b.accessory) parts.push(`💍${b.accessory}`);
  return parts.join(' ');
}

export function MeleeResult({ view }: { view: MeleeResultView }) {
  const [tab, setTab] = useState<'replay' | 'mine'>('replay');
  const { podium, me, myKills, finale, participantCount, championNickname } = view;
  const roster = finale.roster;

  return (
    <div className="space-y-4">
      {/* 랭킹 — 1·2·3 강조 */}
      <section className="rounded-2xl border border-amber-700/40 bg-gradient-to-b from-amber-950/30 to-zinc-950 p-4">
        <div className="text-center text-[11px] text-zinc-400">
          오늘의 대난투 · 참가 {participantCount.toLocaleString()}명
        </div>
        <div className="mt-3 flex items-end justify-center gap-2">
          {podium.map((p) => (
            <div
              key={p.rank}
              className={`flex flex-1 flex-col items-center rounded-xl border px-1 py-2 text-center ${
                p.rank === 1
                  ? 'border-amber-400/70 bg-amber-500/10 -mt-2'
                  : 'border-zinc-700 bg-zinc-900/50'
              }`}
            >
              <span className="text-2xl">{MEDAL[p.rank]}</span>
              <span className="mt-0.5 line-clamp-1 break-all text-[12px] font-bold text-white">
                {p.nickname}
              </span>
              <span className="text-[10px] tabular-nums text-zinc-400">
                ⚔ {p.cp.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 내 순위/보상 */}
      {me ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-center">
          <div className="text-sm">
            내 순위{' '}
            <span className="font-mono text-lg font-extrabold text-amber-300">{me.rank}위</span>
            <span className="text-zinc-500"> / {participantCount.toLocaleString()}명</span>
          </div>
          <div className="mt-1 text-[12px] text-zinc-300">
            보상 {me.diamond > 0 ? `💎${me.diamond.toLocaleString()} · ` : ''}
            {boxSummary(me.boxes) || '없음'}
            <span className="ml-1 text-[10px] text-zinc-500">(우편 수령)</span>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-zinc-800 p-3 text-center text-xs text-zinc-400">
          오늘 대난투에 참가하지 않았어요 (강화 1회 이상이면 자동 참가).
        </section>
      )}

      {/* 탭 */}
      <div className="flex gap-1 rounded-xl border border-zinc-800 p-1">
        {(['replay', 'mine'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
              tab === t ? 'bg-amber-600 text-white' : 'text-zinc-400'
            }`}
          >
            {t === 'replay' ? '전투 리플레이' : '내 전투'}
          </button>
        ))}
      </div>

      {tab === 'replay' ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-2">
          <div className="px-1 pb-1 text-[10px] text-zinc-500">
            마지막 {finale.events.length.toLocaleString()}전 · 👑 {championNickname}
          </div>
          <ul className="max-h-[60vh] divide-y divide-zinc-900 overflow-y-auto text-[11px]">
            {finale.events.map((e, i) => {
              const a = roster[e[0]]?.nickname ?? '?';
              const t = roster[e[1]]?.nickname ?? '?';
              const dmg = e[2];
              const killed = e[3] === 1;
              return (
                <li key={i} className="flex items-center gap-1 px-1 py-1 leading-tight">
                  <span className="truncate font-medium text-zinc-200">{a}</span>
                  <span className="text-zinc-600">⚔</span>
                  <span className="truncate text-zinc-300">{t}</span>
                  <span className="ml-auto shrink-0 font-mono text-zinc-500">
                    {dmg.toLocaleString()}
                  </span>
                  <span
                    className={`ml-1 shrink-0 ${killed ? 'font-bold text-red-400' : 'text-zinc-500'}`}
                  >
                    {killed ? '탈락' : '버팀'}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="px-1 pt-1 text-center text-[9px] text-zinc-600">
            아바타 애니메이션 리플레이는 곧 추가됩니다.
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
          {me ? (
            <>
              <div className="text-[12px] text-zinc-300">
                나를 쓰러뜨린 자:{' '}
                <span className="font-bold text-red-300">{me.killerNickname ?? '— (챔피언!)'}</span>
              </div>
              <div className="mt-2 text-[12px] font-semibold text-zinc-200">
                내가 쓰러뜨린 상대 {myKills.length}명
              </div>
              {myKills.length > 0 ? (
                <ul className="mt-1 max-h-[50vh] space-y-0.5 overflow-y-auto text-[11px]">
                  {myKills.map((k, i) => (
                    <li key={i} className="flex justify-between px-1 py-0.5">
                      <span className="truncate text-zinc-300">{k.nickname}</span>
                      <span className="shrink-0 font-mono text-zinc-500">{k.rank}위</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-1 text-[11px] text-zinc-500">처치 기록이 없어요.</div>
              )}
            </>
          ) : (
            <div className="text-center text-xs text-zinc-500">참가 시 내 전투가 표시됩니다.</div>
          )}
        </section>
      )}
    </div>
  );
}
