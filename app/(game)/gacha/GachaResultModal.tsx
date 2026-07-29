'use client';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout } from '@/components/ModalLayout';
import { useEffect, useRef, useState } from 'react';

import type { Slot } from '@/lib/db/schema/equipment';
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder } from '@/components/RarityFrame';
import { transcendStyle } from '@/lib/game/equipment/transcend';
import { advanceTutorial } from '@/components/tutorial/events';
import { sounds } from '@/lib/game/sound';

import type { OpenedItem } from './actions';

/**
 * 한 결과 카드 — 인벤토리 목록 카드와 동일한 디자인(rounded-xl border-2 + 등급 테두리 +
 * RarityFrame 별 장식 + frameless 스프라이트 + 이름 + ✦초월수치). 강화수치는 표기 안 함.
 *
 * 초월 연출(transcended>0): 단계마다 ① 부르르 떨림 → ② ✦수치가 한 단계 오르며 테두리/별/색이
 * 새 등급으로 전환(같은 10레벨 색 구간이면 테두리는 그대로). 빛 효과는 사용하지 않음.
 */
function ResultCard({
  r,
  slot,
  big,
  onClick,
}: {
  r: OpenedItem & { count?: number };
  slot: Slot;
  big?: boolean;
  onClick?: () => void;
}) {
  const finalT = r.transcendLevel;
  const steps = r.transcended > 0 ? r.transcended : 0;
  const fromT = Math.max(0, finalT - steps);
  const [shown, setShown] = useState(steps > 0 ? fromT : finalT);
  const [tremKey, setTremKey] = useState(0); // 떨림 트리거
  const [stepKey, setStepKey] = useState(0); // 단계 상승(숫자·테두리 변화) 트리거

  useEffect(() => {
    if (steps <= 0) {
      setShown(finalT);
      return;
    }
    setShown(fromT);
    let cur = fromT;
    const STEP = 760; // 단계당 총 길이(ms)
    const TREM = 440; // 떨림 후 상승(숫자·테두리 변화) 시점
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < steps; i++) {
      const base = i * STEP;
      timers.push(setTimeout(() => setTremKey((k) => k + 1), base + 20));
      timers.push(
        setTimeout(() => {
          cur += 1;
          setShown(cur);
          setStepKey((k) => k + 1);
          sounds.gachaReveal(); // 등급 상승(초월) 공개음
        }, base + TREM),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [fromT, finalT, steps]);

  const st = transcendStyle(shown);
  const grade = `rgb(${st.colorRgb.join(',')})`;
  const spriteSize = big ? 76 : 48;

  return (
    <button
      type="button"
      onClick={onClick}
      title={r.name}
      style={{ ...rarityBorderStyle(shown), transition: 'border-color 400ms ease-out' }}
      className={`relative flex aspect-square flex-col items-center justify-center gap-0.5 isolate overflow-hidden rounded-xl border-2 bg-white px-1 text-center dark:bg-zinc-950 ${
        big ? 'w-full' : ''
      } ${hasRarityBorder(shown) ? '' : 'border-zinc-200 dark:border-zinc-800'}`}
    >
      <RarityFrame level={shown} />
      {r.isNew ? (
        <span className="absolute left-1.5 top-1.5 z-30 rounded bg-emerald-500 px-1 text-[8px] font-bold text-white">
          NEW
        </span>
      ) : null}
      {r.count && r.count > 1 ? (
        <span className="absolute right-1.5 top-1.5 z-30 rounded bg-zinc-900/80 px-1 text-[9px] font-bold text-white">
          ×{r.count}
        </span>
      ) : null}
      {/* 떨림은 스프라이트에만 — 단계 직전 부르르 (빛 효과 없음) */}
      <span
        key={`t${tremKey}`}
        className="relative z-10 flex"
        style={tremKey > 0 ? { animation: 'gacha-transcend-tremble 440ms ease-in-out' } : undefined}
      >
        <TranscendSprite
          code={r.code}
          slot={slot}
          level={shown}
          championRank={r.championRank}
          size={spriteSize}
          frameless
        />
      </span>
      <span
        className={`line-clamp-2 break-keep px-0.5 leading-tight text-zinc-600 dark:text-zinc-400 ${
          big ? 'text-[13px] font-medium' : 'min-h-[2.5em] text-[9px]'
        }`}
      >
        {r.name}
      </span>
      <span
        key={`p${stepKey}`}
        className={`font-semibold tabular-nums ${big ? 'text-[13px]' : 'text-[9.5px]'}`}
        style={{
          color: grade,
          animation: stepKey > 0 ? 'gacha-transcend-tick 360ms ease-out' : undefined,
        }}
      >
        ✦{shown}
      </span>
    </button>
  );
}

export function GachaResultModal({
  slot,
  slotLabel,
  results,
  remaining,
  pulling,
  errorTick,
  onAgain,
  onClose,
}: {
  slot: Slot;
  slotLabel: string;
  results: OpenedItem[];
  remaining: number;
  pulling: boolean;
  /** 개봉 에러 신호(증가 카운터) — 변하면 자동 반복 중지(무한 에러 재시도 방지). */
  errorTick: number;
  onAgain: (n: number) => void;
  onClose: () => void;
}) {
  // ② 같은 종류는 하나로 묶기 — 박스 순서상 마지막 엔트리가 최종 상태(누적), transcended 합산·count.
  const groupedMap = new Map<number, OpenedItem & { count: number }>();
  for (const r of results) {
    const g = groupedMap.get(r.catalogItemId);
    groupedMap.set(r.catalogItemId, {
      ...r, // 최종(transcendLevel/Progress/championRank)은 최신 엔트리
      count: (g?.count ?? 0) + 1,
      transcended: (g?.transcended ?? 0) + r.transcended,
      isNew: (g?.isNew ?? false) || r.isNew,
      loreTeaser: g?.loreTeaser ?? r.loreTeaser,
    });
  }
  // ③ 초월 수치 내림차순 → 동률이면 다음 초월에 가까운(진행도 비율) 순.
  const sortedResults = [...groupedMap.values()].sort(
    (a, b) =>
      b.transcendLevel - a.transcendLevel ||
      b.transcendProgress / (b.transcendLevel + 1) - a.transcendProgress / (a.transcendLevel + 1),
  );
  const single = results.length === 1 ? results[0]! : null;
  const multiN = remaining >= 2 ? Math.min(10, remaining) : 10;
  const [openLoreIdx, setOpenLoreIdx] = useState<number | null>(null);
  const [resultKey, setResultKey] = useState(0);
  useEffect(() => {
    setResultKey((k) => k + 1);
    setOpenLoreIdx(null);
  }, [results]);

  // 자동 반복 — 체크 후 '한 번 더/N회 더'를 누르면 상자 소진/중지까지 그 버튼을 대신 눌러준다.
  // 매 회 실제 개봉이 모달에 그대로 표시(버튼을 대신 누르는 느낌). 서버 개봉(onAgain)의 완료
  // 전이(pulling true→false)마다 다음 개봉을 예약해 동기화한다.
  const [autoRepeat, setAutoRepeat] = useState(false);
  const [autoActive, setAutoActive] = useState(false);
  const [autoN, setAutoN] = useState(1);
  const onAgainRef = useRef(onAgain);
  onAgainRef.current = onAgain; // 최신 onAgain(매 렌더 새 함수)을 ref로 — 효과 deps churn 방지
  const prevPulling = useRef(pulling);
  useEffect(() => {
    const justFinished = prevPulling.current && !pulling;
    prevPulling.current = pulling;
    if (!autoActive) return;
    if (remaining < 1) { setAutoActive(false); return; } // 소진 → 정지
    if (!justFinished) return;
    const n = Math.min(autoN, remaining);
    const t = setTimeout(() => onAgainRef.current(n), 450); // 다음 개봉(간격)
    return () => clearTimeout(t);
  }, [pulling, remaining, autoActive, autoN]);
  // 개봉 에러 → 자동 반복 중지 — remaining이 스테일(마지막 성공값)이라 이 신호 없이는
  // NO_BOX/레이트리밋 에러를 무한 재시도한다(2026-07-27 프로덕션 전 검수).
  useEffect(() => {
    if (errorTick > 0) setAutoActive(false);
  }, [errorTick]);
  const startAgain = (n: number) => {
    if (autoRepeat) {
      setAutoN(n);
      setAutoActive(true);
      onAgain(Math.min(n, remaining)); // 첫 개봉 kick(이후는 완료 전이마다 효과가 이어감)
    } else {
      onAgain(n);
    }
  };

  return (
    // 등장 연출(gacha-result-in)은 패널에 그대로 두고 껍데기만 공용 셸로(2026-07-29 점검).
    <ModalShell onClose={onClose} onSubmit={onClose} label="보급 결과">
      <ModalLayout
        title="보급 결과"
        subtitle={
          single ? (
            <span className="font-bold text-amber-600 dark:text-amber-400">1개 획득</span>
          ) : (
            <span className="font-bold text-amber-600 dark:text-amber-400">
              {results.length}개 획득
            </span>
          )
        }
        maxBodyClass="max-h-[62vh]"
        footer={
          <>
            {autoActive ? (
              <button
                type="button"
                onClick={() => setAutoActive(false)}
                style={{ flex: 2 }}
                className="rounded-xl bg-red-500 py-2.5 text-[13px] font-bold text-white"
              >
                중지 ({remaining}개)
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={pulling || remaining < 1}
                  onClick={() => startAgain(1)}
                  style={{ flex: 1 }}
                  className="rounded-xl border border-zinc-300 bg-white py-2.5 text-[12.5px] font-bold text-zinc-700 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  1회 더
                </button>
                <button
                  type="button"
                  disabled={pulling || remaining < 2}
                  onClick={() => startAgain(multiN)}
                  style={{ flex: 1 }}
                  className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-[12.5px] font-bold text-white disabled:opacity-40"
                >
                  {multiN}회 더
                </button>
              </>
            )}
            <button
              type="button"
              data-tut="gacha-confirm"
              disabled={autoActive}
              onClick={() => {
                advanceTutorial();
                onClose();
              }}
              style={{ flex: 1 }}
              className="rounded-xl bg-zinc-900 py-2.5 text-[12.5px] font-bold text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
            >
              확인
            </button>
          </>
        }
      >
      <div style={{ animation: 'gacha-result-in 220ms ease-out' }}>
        <div key={resultKey} style={{ animation: 'gacha-result-swap 240ms ease-out' }}>
          {single ? (
            <div className="flex flex-col items-center text-center">
              <div className="w-36">
                <ResultCard r={single} slot={slot} big />
              </div>
              {single.isNew && single.loreTeaser ? (
                <div className="mt-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-left dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                    {single.loreTeaser}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {/* 3열 — 4열은 정보를 담기에 좁다(2026-07-29 피드백). 컨텐츠만 스크롤되므로 줄 수는 무관. */}
              <div className="grid grid-cols-3 gap-2">
                {sortedResults.map((r, i) => (
                  <ResultCard
                    key={i}
                    r={r}
                    slot={slot}
                    onClick={() => {
                      if (!r.isNew) return;
                      setOpenLoreIdx(openLoreIdx === i ? null : i);
                    }}
                  />
                ))}
                {/* 10칸 자리채움(2026-07-16 고객 문의) — 중복 묶음으로 카드 수가 1~10 가변이라
                    줄 수가 바뀌며 하단 버튼이 이동. 실카드와 동일 규격(그리드 폭 × aspect-square
                    × border-2, border-box)의 투명 정사각으로 4줄 높이 고정 — 카드 클론은 래퍼 안에서
                    내용물 폭으로 줄어들어 행 높이가 어긋났음(잔여 이동 원인). */}
                {Array.from({ length: Math.max(0, 10 - sortedResults.length) }, (_, i) => (
                  <div key={`ph-${i}`} aria-hidden className="invisible aspect-square w-full rounded-lg border-2" />
                ))}
              </div>
              {openLoreIdx !== null && sortedResults[openLoreIdx]?.loreTeaser ? (
                <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-3 text-left dark:border-emerald-800 dark:bg-emerald-950/30">
                  <div className="mb-1 text-[10px] font-semibold tracking-wide text-emerald-700 dark:text-emerald-300">
                    {sortedResults[openLoreIdx]!.name}
                  </div>
                  <p className="text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-200">
                    {sortedResults[openLoreIdx]!.loreTeaser}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* 자동 반복 체크 + 남은 상자 한 줄 — 가운데점 구분(내부 스크롤 유발하던 별도 블록 제거). */}
        <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
          <label className="flex items-center gap-1.5 font-medium">
            <input
              type="checkbox"
              checked={autoRepeat}
              onChange={(e) => setAutoRepeat(e.target.checked)}
              disabled={autoActive}
              className="h-3.5 w-3.5 accent-amber-500"
            />
            자동 반복
          </label>
          <span aria-hidden className="text-zinc-400 dark:text-zinc-600">·</span>
          <span>남은 {slotLabel} 상자 {remaining}개</span>
        </div>
      </div>
      </ModalLayout>
    </ModalShell>
  );
}
