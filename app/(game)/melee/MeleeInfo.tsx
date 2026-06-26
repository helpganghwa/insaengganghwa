'use client';

import { useState } from 'react';
import Link from 'next/link';

import { MELEE_REWARD_TIERS } from '@/lib/game/balance';
import { assetUrl } from '@/lib/asset-versions';
import { meleeFaceCropStyle } from '@/components/faceCrop';
import type { MeleeHistoryRow } from '@/lib/game/melee/history';

export type { MeleeHistoryRow };

/**
 * 보상 테이블 + 역대 우승자 — 탭 전환. MELEE §6.
 * showBanner=false: 상단 아레나 배너 생략(대기/진행중 화면에 무대 아래로 임베드 시).
 */
export function MeleeInfo({
  history,
  initialTab = 'reward',
  showBanner = true,
}: {
  history: MeleeHistoryRow[];
  initialTab?: 'reward' | 'history';
  showBanner?: boolean;
}) {
  const [tab, setTab] = useState<'reward' | 'history'>(initialTab);

  // 필터(탭) — standalone에서는 고정 영역, 임베드에서는 본문 위.
  const tabBar = (
    <div className="mx-4 flex gap-1 rounded-xl border border-zinc-800 p-1">
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
  );

  const body = (
    <>
      {tab === 'reward' ? (
        <div className="isolate mx-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-zinc-900 px-3 py-2 text-[10px] font-bold text-zinc-500">
            <span>순위</span>
            <span className="w-16 text-right text-sm">💎</span>
            <span className="w-14 text-right text-sm">📦</span>
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
          {/* 소수 N 유령티어 안내(감사 B6) — 인원 적을 때 상위 % 구간이 1~3위에 흡수돼 별도 적용 안 될 수 있음. */}
          <p className="px-3 pt-2 text-[10px] leading-relaxed text-zinc-500">
            ※ 상위 % 구간은 참가 인원에 따라 적용 등수가 달라지며, 인원이 적을 때 일부 구간은 상위
            등수(1~3위)에 포함되어 별도로 적용되지 않을 수 있습니다.
          </p>
        </div>
      ) : history.length === 0 ? (
        <div className="mx-4 rounded-xl border border-zinc-800 px-3 py-10 text-center text-[12px] text-zinc-500">
          아직 발표된 대난투가 없습니다.
        </div>
      ) : (
        /* 로그처럼 풀폭(엣지-투-엣지, 별도 박스 없음) */
        <ul className="border-t border-zinc-900/60">
          {history.map((h) => {
            const inner = (
              <>
                {/* 챔피언 아바타 — 우측 배경 레이어. height/top으로 상반신·얼굴이 박스 세로 중앙. */}
                {h.championAvatar ? (
                  <div className="pointer-events-none absolute inset-y-0 right-0 w-40">
                    {/* 얼굴중심 크롭 — 아바타별 실제 faceBox(없으면 폴백). 가로 스트립 보정. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={h.championAvatar}
                      alt=""
                      aria-hidden
                      className="absolute inset-0 h-full w-full"
                      style={meleeFaceCropStyle(h.championFaceBox)}
                    />
                  </div>
                ) : null}
                {/* 콘텐츠 — 좌측. */}
                <div className="relative z-10 px-3 py-3.5">
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
                      전투력{' '}
                      <span className="font-mono text-zinc-300">
                        {h.championCp.toLocaleString()}
                      </span>
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span>참가 {h.participantCount.toLocaleString()}명</span>
                  </div>
                </div>
              </>
            );
            return (
              <li key={h.edition} className="border-b border-zinc-900/60">
                {/* 회차(카드) 클릭 → 그날 결과로 이동. */}
                <Link
                  href={`/melee/battle/${h.battleId}`}
                  className="relative block overflow-hidden transition active:bg-zinc-900/60"
                >
                  {inner}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  /* 상단 아레나 배경 배너 — standalone에서 고정. */
  const banner = (
    <div className="relative h-28 shrink-0 overflow-hidden border-b border-zinc-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl('/sprites/hub/melee.png')}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-black/35 to-black/70" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-0.5">
        <h1 className="text-pixel-outline text-lg font-extrabold text-white">대난투 정보</h1>
        <p className="text-pixel-outline text-[11px] font-bold text-amber-200">
          {tab === 'reward' ? '보상 테이블' : '역대 우승자'}
        </p>
      </div>
    </div>
  );

  // standalone(/melee/info) — 배너+필터를 상단 고정, 본문만 스크롤(대난투 결과 화면과 동일 패턴).
  if (showBanner) {
    return (
      <div className="flex h-full flex-col">
        {banner}
        <div className="shrink-0 bg-zinc-950 pt-3 pb-3">{tabBar}</div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-6">{body}</div>
      </div>
    );
  }

  // 임베드(대기/진행중 무대 아래) — 일반 흐름.
  return (
    <div className="space-y-3 pt-3 pb-6">
      {tabBar}
      {body}
    </div>
  );
}
