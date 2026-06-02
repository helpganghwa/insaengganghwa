'use client';

import { useState } from 'react';
import Link from 'next/link';

import { MELEE_REWARD_TIERS } from '@/lib/game/balance';

export type MeleeHistoryRow = {
  edition: number;
  championNick: string;
  championCode: string | null;
  championAvatar: string | null;
  championCp: number;
  participantCount: number;
  /** 그 회차 내 순위(미참가면 null). */
  myRank: number | null;
};

/** 보상 테이블 + 역대 우승자 — 탭 전환. MELEE §6. */
export function MeleeInfo({ history }: { history: MeleeHistoryRow[] }) {
  const [tab, setTab] = useState<'reward' | 'history'>('reward');
  return (
    <div className="space-y-3 px-4 py-4">
      <h1 className="text-lg font-extrabold text-white">대난투 정보</h1>

      <div className="flex gap-1 rounded-xl border border-zinc-800 p-1">
        {(
          [
            ['reward', '보상 테이블'],
            ['history', '역대 우승자'],
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

      {tab === 'reward' ? (
        <section className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-zinc-900 px-3 py-2 text-[10px] font-bold text-zinc-500">
              <span>순위</span>
              <span className="w-16 text-right">다이아</span>
              <span className="w-14 text-right">보급상자</span>
            </div>
            <ul>
              {MELEE_REWARD_TIERS.map((t) => (
                <li
                  key={t.label}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-zinc-900/60 px-3 py-2.5 text-[12px] last:border-b-0"
                >
                  <span className="font-bold text-white">{t.label}</span>
                  <span className="w-16 text-right font-mono text-sky-300">
                    {t.diamond > 0 ? t.diamond.toLocaleString() : '—'}
                  </span>
                  <span className="w-14 text-right font-mono text-amber-300">{t.boxes}</span>
                </li>
              ))}
            </ul>
          </div>
          <ul className="space-y-1.5 px-1 text-[11px] leading-relaxed text-zinc-400">
            <li>· 강화를 1회 이상 한 모든 유저가 매일 자동 참가합니다.</li>
            <li>· 매일 오전 9시 개시, 9시 30분에 순위·보상이 발표됩니다.</li>
            <li>· 상위 %는 참가 인원 기준이며, 보상은 한 등급만(중복 없음) 지급됩니다.</li>
            <li>· 보급상자는 무기·방어구·장신구 중 무작위로 지급됩니다.</li>
          </ul>
        </section>
      ) : history.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 px-3 py-10 text-center text-[12px] text-zinc-500">
          아직 발표된 대난투가 없습니다.
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
          {history.map((h) => {
            const avatar = h.championAvatar ? (
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={h.championAvatar}
                  alt=""
                  aria-hidden
                  className="absolute inset-x-0 top-0 mx-auto h-auto w-full object-top"
                  style={{ imageRendering: 'pixelated', transform: 'scale(1.9)', transformOrigin: 'top center' }}
                />
              </div>
            ) : (
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-zinc-900 text-base font-bold text-zinc-500">
                {h.championNick.slice(0, 1)}
              </div>
            );
            return (
              <li key={h.edition} className="border-b border-zinc-900/60 last:border-b-0">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-12 shrink-0 text-center font-mono text-[12px] font-extrabold text-amber-300">
                    제{h.edition}회
                  </span>
                  {h.championCode ? (
                    <Link href={`/u/${encodeURIComponent(h.championCode)}`}>{avatar}</Link>
                  ) : (
                    avatar
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-white">
                      {h.championCode ? (
                        <Link href={`/u/${encodeURIComponent(h.championCode)}`} className="hover:underline">
                          {h.championNick}
                        </Link>
                      ) : (
                        h.championNick
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      전투력 <span className="font-mono text-zinc-300">{h.championCp.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[10px] text-zinc-400">
                    <div>참가 {h.participantCount.toLocaleString()}</div>
                    {h.myRank != null ? (
                      <div className="font-mono text-amber-300">내 {h.myRank.toLocaleString()}위</div>
                    ) : (
                      <div className="text-zinc-600">미참가</div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
