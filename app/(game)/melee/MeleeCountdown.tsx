'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { assetUrl } from '@/lib/asset-versions';
import type { MeleeHistoryRow } from '@/lib/game/melee/history';

import { MeleeInfo } from './MeleeInfo';

/**
 * 대난투 발표 전 화면 — MELEE §8.
 *  - 상단: 결과 무대와 동일 크기(h-60)의 아레나 이미지 + 정보·남은시간 오버레이.
 *      now < 9시: "오늘 9시 개시" / 9~9:30: "난투 진행 중" / 9:30↑ 미발표: "집계 중"(자동 새로고침)
 *  - 하단: 보상 테이블 · 역대 우승자(MeleeInfo, 스크롤).
 */
function fmt(ms: number): string {
  if (ms <= 0) return '00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return h > 0 ? `${h}:${mm}` : mm;
}

export function MeleeCountdown({
  edition,
  runAtIso,
  revealAtIso,
  participantCount,
  history,
}: {
  edition: number;
  runAtIso: string;
  revealAtIso: string;
  participantCount: number | null;
  history: MeleeHistoryRow[];
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const runAt = new Date(runAtIso).getTime();
  const revealAt = new Date(revealAtIso).getTime();

  // 9:30 지나면 결과가 곧 뜸 — 주기적 새로고침으로 발표 반영.
  useEffect(() => {
    if (now < revealAt) return;
    const t = setTimeout(() => router.refresh(), 10_000);
    return () => clearTimeout(t);
  }, [now, revealAt, router]);

  let label: string;
  let sub: string;
  let target = 0;
  if (now < runAt) {
    label = '오늘 오전 9시 개시';
    sub = '9시 30분 결과 발표';
    target = runAt;
  } else if (now < revealAt) {
    label = '난투 진행 중';
    sub = '오전 9시 30분 결과 발표';
    target = revealAt;
  } else {
    label = '결과 집계 중';
    sub = '곧 발표됩니다';
    target = 0;
  }

  return (
    <div className="flex h-full flex-col">
      {/* 무대 — 결과 화면과 동일 크기(h-60 고정). melee.png + 정보·남은시간 오버레이. */}
      <div className="relative h-60 shrink-0 overflow-hidden border-b border-amber-900/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl('/sprites/hub/melee.png')}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-black/80" />

        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
          <div className="text-2xl font-extrabold tracking-wide text-white text-pixel-outline">
            제{edition.toLocaleString()}회 대난투
          </div>
          <div className="text-sm font-bold text-amber-300 text-pixel-outline">{label}</div>
          {target > 0 ? (
            <div className="font-mono text-5xl font-extrabold tabular-nums text-white text-pixel-outline">
              {fmt(target - now)}
            </div>
          ) : (
            <div className="text-lg font-bold text-zinc-200 text-pixel-outline">집계 중…</div>
          )}
          <div className="text-[11px] text-zinc-200 text-pixel-outline">{sub}</div>
          <div className="mt-1 rounded-full bg-black/55 px-3 py-1 text-[11px] font-medium text-zinc-100 backdrop-blur-sm">
            {participantCount != null
              ? `참가 ${participantCount.toLocaleString()}명`
              : '강화 1회 이상이면 자동 참가'}
          </div>
        </div>
      </div>

      {/* 하단 — 보상 테이블 · 역대 우승자(스크롤). 무대가 배너 역할이라 banner 생략. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MeleeInfo history={history} showBanner={false} />
      </div>
    </div>
  );
}
