'use client';

import { useState } from 'react';
import Link from 'next/link';

import { MELEE_REWARD_TIERS } from '@/lib/game/balance';
import { assetUrl } from '@/lib/asset-versions';

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
    <div className="pb-6">
      {/* 상단 아레나 배경 배너 */}
      <div className="relative h-28 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl('/sprites/hub/melee.png')}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-black/35 to-black/80" />
        <div className="relative z-10 flex h-full flex-col items-center justify-end pb-3">
          <h1 className="text-lg font-extrabold text-white text-pixel-outline">대난투 정보</h1>
          <p className="text-[10px] font-medium text-amber-200 text-pixel-outline">보상 · 역대 우승자</p>
        </div>
      </div>

      <div className="space-y-3 px-4 pt-3">
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
        ) : history.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 px-3 py-10 text-center text-[12px] text-zinc-500">
            아직 발표된 대난투가 없습니다.
          </div>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
            {history.map((h) => {
              const inner = (
                <>
                  {/* 챔피언 아바타 — 배경 레이어(얼굴 중심, 좌→우 페이드) */}
                  {h.championAvatar ? (
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-28 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={h.championAvatar}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 h-full w-full object-cover"
                        style={{
                          imageRendering: 'pixelated',
                          objectPosition: 'center 20%',
                          transform: 'scale(1.45)',
                          transformOrigin: 'center 20%',
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/45 to-transparent" />
                    </div>
                  ) : null}
                  {/* 콘텐츠 — 아바타 위 */}
                  <div className="relative z-10 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-300">
                        제{h.edition}회
                      </span>
                      <span className="min-w-0 truncate text-[13px] font-bold text-white">
                        {h.championNick}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-400">
                      <span>
                        전투력 <span className="font-mono text-zinc-300">{h.championCp.toLocaleString()}</span>
                      </span>
                      <span className="text-zinc-600">·</span>
                      <span>참가 {h.participantCount.toLocaleString()}</span>
                      <span className="text-zinc-600">·</span>
                      {h.myRank != null ? (
                        <span className="font-medium text-amber-300">내 순위 {h.myRank.toLocaleString()}위</span>
                      ) : (
                        <span className="text-zinc-600">미참가</span>
                      )}
                    </div>
                  </div>
                </>
              );
              return (
                <li key={h.edition} className="border-b border-zinc-900/60 last:border-b-0">
                  {h.championCode ? (
                    <Link
                      href={`/u/${encodeURIComponent(h.championCode)}`}
                      className="relative block overflow-hidden transition active:bg-zinc-900/60"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="relative overflow-hidden">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
