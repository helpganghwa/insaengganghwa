'use client';

import { useEffect } from 'react';

import { useServerClock } from '@/lib/client/use-server-clock';
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
  nowIso,
}: {
  edition: number;
  runAtIso: string;
  /** 서버 렌더 시각 — 보정 시계의 출발점(useServerClock 주석 참조). */
  nowIso: string;
  /** 난투 진행 중 → 우승컵 전달 중 전환 경계(09:45). */
  deliverAtIso: string;
  revealAtIso: string;
  /** 오늘 배틀 행 존재 여부. false면 산출 미완(run 재시도 중)·참가자 부족 → "참가자 집계 중". */
  hasBattle: boolean;
  participantCount: number | null;
  history: MeleeHistoryRow[];
}) {
  const router = useRouter();
  // 서버 시각으로 시작하는 보정 시계 — 폰 시계가 밀려도 발표 전환(shouldPoll)이 서버와 같은
  // 시점에 걸린다. 종전엔 Date.now()라 시계가 밀린 기기에서 발표가 나도 화면이 안 넘어갔다.
  const now = useServerClock(nowIso);

  const runAt = new Date(runAtIso).getTime();
  const deliverAt = new Date(deliverAtIso).getTime();
  const revealAt = new Date(revealAtIso).getTime();

  // reveal 틱은 10:00~10:55 5분 주기 → 첫 틱 여유(발표 직후 ~5분은 "곧 발표", 그 이후만 "지연").
  const REVEAL_GRACE_MS = 6 * 60_000;

  // 새로고침: ① 발표시각 지났는데 미발표(reveal 틱 반영) ② 배틀 미생성 + 산출시각 지남(run이
  // 9:55까지 5분 재시도라 늦게 생성된 배틀 반영). 폴링으로 화면 자동 갱신.
  // ⚠ deps에 now(1초 클럭)를 넣으면 안 됨 — 매초 cleanup→재설정되어 타이머가 영원히 안
  // 터진다(2026-08-06 감사에서 발견: 발표 후 화면이 수동 새로고침 전까지 갇혀 있었음).
  // boolean으로 접어 전이 시에만 effect가 돌게 한다.
  // 폴링은 상태 JSON(/api/melee/status, 1쿼리)으로(2026-11-06 업데이트 18) — 종전엔 틱마다 router.refresh로
  // 페이지·레이아웃 전체(회차 수·역대 우승자 포함)를 다시 그렸다. 이제 발표됐거나 배틀 행이 새로 생겼을(또는 참가
  // 수가 바뀌었을) 때만 한 번 refresh한다 — 화면이 보여 주는 값(라벨·참가 수)이 바뀌는 경우와 같다.
  const shouldPoll = now >= revealAt || (!hasBattle && now >= runAt);
  useEffect(() => {
    if (!shouldPoll) return;
    let stopped = false;
    let refreshedAt = 0;
    /** 429 등으로 쉬는 동안(이 시각 전) 폴링을 건너뛴다(2026-11-06 업데이트 18). */
    let pausedUntil = 0;
    let backoffMs = 30_000;
    // 지터(10~15초) — 발표 시각(10:00)에 전 서버 유저의 폴링이 동시에 살아나는 herd 방지.
    // 백그라운드 탭은 스킵(복귀하면 다음 틱이 잡는다).
    const delay = 10_000 + Math.random() * 5_000;
    const t = setInterval(() => {
      if (stopped || document.hidden || Date.now() < pausedUntil) return;
      fetch('/api/melee/status', { cache: 'no-store' })
        .then(async (res) => {
          if (stopped) return;
          if (res.status === 401) {
            // 세션 만료 — 종전 router.refresh 폴링처럼 서버 렌더가 로그인으로 보낸다. 한 번만 하고 폴링을 멈춘다.
            stopped = true;
            clearInterval(t);
            router.refresh();
            return;
          }
          if (res.status === 429) {
            // 요청 제한 — 점점 길게 쉰다(최대 2분). 화면은 그대로, 쉬는 동안 바뀐 것은 다음 성공 폴링이 잡는다.
            pausedUntil = Date.now() + backoffMs;
            backoffMs = Math.min(backoffMs * 2, 120_000);
            return;
          }
          if (!res.ok) {
            // 상태 조회 실패(5xx 등) — 종전 폴링과 같이 이번 틱은 화면을 통째로 새로 받는다(변화를 놓치지 않게).
            router.refresh();
            return;
          }
          backoffMs = 30_000;
          const st = (await res.json()) as { hasBattle?: boolean; revealed?: boolean; participantCount?: number | null };
          if (stopped || !st) return;
          const changed =
            st.revealed === true ||
            st.hasBattle !== hasBattle ||
            (st.hasBattle === true && (st.participantCount ?? null) !== participantCount);
          // 새 서버 렌더가 도착하면 props(hasBattle·참가 수)가 바뀌어 이 effect가 새 값으로 다시 돈다(또는 결과 화면으로 넘어간다).
          // 도착이 늦는 동안 같은 변화로 refresh가 겹치지 않게 20초 간격을 둔다 — 그래도 안 바뀌면 종전처럼 다시 refresh.
          if (!changed || Date.now() - refreshedAt < 20_000) return;
          refreshedAt = Date.now();
          router.refresh();
        })
        // 네트워크 실패 — 다음 틱이 다시 본다(종전 refresh도 오프라인이면 실패했다).
        .catch(() => {});
    }, delay);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [shouldPoll, router, hasBattle, participantCount]);

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
    label = '결과 집계 중 · 곧 발표';
    timerMs = revealAt - now;
  } else if (now < revealAt + REVEAL_GRACE_MS) {
    label = '곧 결과가 발표됩니다';
    timerMs = now - revealAt; // 발표 대기 — 경과 카운트업
  } else {
    label = '결과 발표가 늦어지고 있습니다';
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
