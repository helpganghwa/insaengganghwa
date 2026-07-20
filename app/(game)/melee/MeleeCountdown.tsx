'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { assetUrl } from '@/lib/asset-versions';
import type { MeleeHistoryRow } from '@/lib/game/melee/history';

import { MeleeInfo } from './MeleeInfo';

/**
 * 대난투 발표 전 화면 — MELEE §8.
 *  - 상단: 결과 무대와 동일 크기(h-60)의 아레나 이미지 + 정보·남은시간 오버레이.
 *      now < 9시: "9시 개시" / 배틀 미생성: "참가자 집계 중"(run은 9:55까지 5분 재시도) /
 *      9~9:45: "난투 진행 중" / 9:45~10:00: "우승컵 전달 중" / 10:00↑: 첫 reveal 틱(~+5분)까진 "곧 발표".
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
  deliverAtIso,
  revealAtIso,
  hasBattle,
  participantCount,
  history,
}: {
  edition: number;
  runAtIso: string;
  /** 난투 진행 중 → 우승컵 전달 중 전환 경계(09:45). */
  deliverAtIso: string;
  revealAtIso: string;
  /** 오늘 배틀 행 존재 여부. false면 산출 미완(run 재시도 중)·참가자 부족 → "참가자 집계 중". */
  hasBattle: boolean;
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
  const deliverAt = new Date(deliverAtIso).getTime();
  const revealAt = new Date(revealAtIso).getTime();

  // reveal 틱은 10:00~10:55 5분 주기 → 첫 틱 여유(발표 직후 ~5분은 "곧 발표", 그 이후만 "지연").
  const REVEAL_GRACE_MS = 6 * 60_000;

  // 새로고침: ① 발표시각 지났는데 미발표(reveal 틱 반영) ② 배틀 미생성 + 산출시각 지남(run이
  // 9:55까지 5분 재시도라 늦게 생성된 배틀 반영). 둘 다 10초 폴링으로 화면 자동 갱신.
  useEffect(() => {
    const shouldPoll = now >= revealAt || (!hasBattle && now >= runAt);
    if (!shouldPoll) return;
    const t = setTimeout(() => router.refresh(), 10_000);
    return () => clearTimeout(t);
  }, [now, revealAt, runAt, hasBattle, router]);

  // 난투·전달은 같은 1시간 카운트다운(10:00 발표 기준), 라벨만 9:45 경계로 변경.
  let label: string;
  let timerMs: number;
  if (now < runAt) {
    label = '9시 개시';
    timerMs = runAt - now;
  } else if (!hasBattle) {
    // 배틀 미생성 — run 재시도 진행 중(9:55까지)이거나 참가자 부족. "진행 중"/"전달 중"으로
    // 단정하지 않고 중립 표기(감사 B3). 곧 폴링 새로고침으로 배틀/발표 반영.
    label = '참가자 집계 중';
    timerMs = revealAt - now;
  } else if (now < deliverAt) {
    label = '난투 진행 중';
    timerMs = revealAt - now;
  } else if (now < revealAt) {
    label = '우승자에게 우승컵 전달 중';
    timerMs = revealAt - now;
  } else if (now < revealAt + REVEAL_GRACE_MS) {
    label = '곧 결과가 발표됩니다';
    timerMs = now - revealAt; // 발표 대기 — 경과 카운트업
  } else {
    label = '우승자에게 우승컵 전달이 늦어지고 있습니다';
    timerMs = now - revealAt; // 발표 지연 — 경과 카운트업
  }

  return (
    <div className="flex h-[calc(100%-var(--chat-dock-h,0px))] flex-col">
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
          <div className="font-mono text-5xl font-extrabold tabular-nums text-white text-pixel-outline">
            {fmt(timerMs)}
          </div>
          {participantCount != null ? (
            <div className="mt-1 rounded-full bg-black/55 px-3 py-1 text-[11px] font-medium text-zinc-100 backdrop-blur-sm">
              참가 {participantCount.toLocaleString()}명
            </div>
          ) : null}
        </div>
      </div>

      {/* 하단 — 보상 테이블 · 역대 우승자(스크롤). 무대가 배너 역할이라 banner 생략. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MeleeInfo history={history} showBanner={false} />
      </div>
    </div>
  );
}
