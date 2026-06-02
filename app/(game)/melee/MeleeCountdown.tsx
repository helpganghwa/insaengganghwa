'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { assetUrl } from '@/lib/asset-versions';

/**
 * 대난투 발표 전 화면 — MELEE §8. 아레나 배경 풀스테이지(결과 화면과 동일 톤).
 *  - now < 9시: "오늘 9시 개시" + 9시 카운트다운
 *  - 9~9:30: "난투 진행 중" + 9:30 카운트다운
 *  - 9:30 지났는데 미발표(cron 지연): "집계 중" — 자동 새로고침
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
}: {
  edition: number;
  runAtIso: string;
  revealAtIso: string;
  participantCount: number | null;
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
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl('/sprites/hub/melee.png')}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-black/80" />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
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

      <div className="relative z-10 flex flex-col items-center gap-2 px-6 pb-6 text-center">
        <p className="text-[11px] leading-relaxed text-zinc-300 text-pixel-outline">
          매일 오전 9시, 강화한 장비 전투력으로 전원이 자동 참가하는 난투. 9시 30분에 순위·보상이 발표됩니다.
        </p>
        <Link
          href="/melee/info"
          className="rounded-full bg-black/55 px-3 py-1 text-[11px] font-medium text-amber-200 backdrop-blur-sm text-pixel-outline"
        >
          보상 테이블 · 역대 우승자 ›
        </Link>
      </div>
    </div>
  );
}
