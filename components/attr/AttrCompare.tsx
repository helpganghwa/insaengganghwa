// 클라이언트 전용 — 'use client' 미부착(부모 클라 그래프에 포함).
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { runeVectorDesc } from '@/components/RuneName';
import {
  ATTR_REGION_COLOR,
  ATTR_REGION_KO,
  AVATAR_ATTR_REGIONS,
  AVATAR_ATTR_TOTAL_MAX,
  attrAdvantagePct,
  attrDisplayVector,
  attrPrey,
  type AvatarAttr,
} from '@/lib/game/balance';

import type { OpponentResult } from './actions';
import { PAIR_ROW_H, type Pair } from './AttrPairChart';

const AttrPairChart = dynamic(() => import('./AttrPairChart').then((m) => m.AttrPairChart), {
  ssr: false,
  loading: () => <div style={{ height: PAIR_ROW_H }} />,
});

/** 지역 속성 — 점 + 지역 + %를 줄바꿈으로. **3줄 높이 고정**(1~3줄 편차로 인한 시프트 방지). */
function AttrLines({ attrs }: { attrs: AvatarAttr[] }) {
  const vec = runeVectorDesc(attrs);
  return (
    <div className="mt-1.5 flex h-[46px] flex-col items-center gap-[2px]">
      {vec.length > 0 ? (
        vec.map(([r, v]) => (
          <span key={r} className="flex items-center gap-1 text-[10px] font-bold leading-[1.35]">
            <i
              className="block h-[5px] w-[5px] shrink-0 rounded-full"
              style={{ backgroundColor: ATTR_REGION_COLOR[r] }}
            />
            <span className="text-zinc-600 dark:text-zinc-300">{ATTR_REGION_KO[r]}</span>
            <b className="font-mono tabular-nums">{v}%</b>
          </span>
        ))
      ) : (
        <span className="text-[10px] text-zinc-400">속성 없음</span>
      )}
    </div>
  );
}

function Face({ src, size = 52 }: { src: string | null; size?: number }) {
  return (
    <span className="flex items-end justify-center overflow-hidden" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          className="h-full w-full object-contain object-bottom"
          style={{ imageRendering: 'pixelated' }}
        />
      ) : null}
    </span>
  );
}

/**
 * 상성 비교(V4) — 중앙 우위 링(양측 수치 내장) + 좌우 아바타(위 닉네임·아래 지역 속성)
 * + 지역별 기여 차트(좌=내 지역 / 우=상대 지역).
 * 계산은 balance.attrAdvantagePct 그대로라 실제 전투와 1:1.
 */
export function AttrCompare({
  onClose,
  myAttrs,
  myNickname,
  mySouth,
  fixedOpponent,
}: {
  onClose: () => void;
  myAttrs: AvatarAttr[];
  myNickname: string;
  mySouth: string | null;
  /** 비교 대상 — 상대 프로필에서만 진입하므로 항상 지정된다. */
  fixedOpponent: OpponentResult;
}) {
  const opp = fixedOpponent;

  const mineVec = useMemo(() => attrDisplayVector(myAttrs), [myAttrs]);
  const oppVec = useMemo(() => attrDisplayVector(opp?.attrs ?? []), [opp]);
  const myAdv = attrAdvantagePct(mineVec, oppVec);
  const oppAdv = attrAdvantagePct(oppVec, mineVec);
  const diff = myAdv - oppAdv;

  // 기여 짝 — 양방향 모두, 큰 순 정렬.
  const pairs: Pair[] = AVATAR_ATTR_REGIONS.flatMap((r) => {
    const out: Pair[] = [];
    // 내가 때리는 몫 — 내 r × 상대 prey(r)
    const my = mineVec[r] ?? 0;
    const oppTarget = oppVec[attrPrey(r)] ?? 0;
    if (my > 0 && oppTarget > 0)
      out.push({
        myRegion: r,
        myVal: my,
        oppRegion: attrPrey(r),
        oppVal: oppTarget,
        gain: (my * oppTarget) / AVATAR_ATTR_TOTAL_MAX,
        mine: true,
      });
    // 상대가 때리는 몫 — 상대 r × 내 prey(r). 좌축은 여전히 내 지역.
    const op = oppVec[r] ?? 0;
    const myTarget = mineVec[attrPrey(r)] ?? 0;
    if (op > 0 && myTarget > 0)
      out.push({
        myRegion: attrPrey(r),
        myVal: myTarget,
        oppRegion: r,
        oppVal: op,
        gain: (op * myTarget) / AVATAR_ATTR_TOTAL_MAX,
        mine: false,
      });
    return out;
  }).sort((a, b) => b.gain - a.gain);

  // 우위 링 — 초록 비중 = 내 몫. 둘 다 0이면 흐린 링 + '상성 없음'.
  const total = myAdv + oppAdv;
  const R = 42;
  const CIRC = 2 * Math.PI * R;
  const myShare = total > 0 ? myAdv / total : 0.5;

  return (
    <ModalShell
      onClose={onClose}
      label="상성 비교"
      className="max-h-[86dvh] w-full max-w-[320px] overflow-y-auto rounded-2xl bg-white p-4 dark:bg-zinc-950"
    >
      <h2 className="text-[15px] font-bold">상성 비교</h2>

      {opp ? (
        <>
          <div className="mt-3 flex items-start justify-center gap-2">
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-[11px] font-bold">{myNickname}</p>
              <div className="mt-1 flex justify-center">
                <Face src={mySouth} size={76} />
              </div>
              <AttrLines attrs={myAttrs} />
            </div>

            <div className="mt-4 shrink-0">
              <div className="relative h-[100px] w-[100px]">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r={R}
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="8"
                    opacity={total > 0 ? 1 : 0.14}
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={R}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="8"
                    strokeDasharray={CIRC}
                    strokeDashoffset={CIRC * (1 - myShare)}
                    opacity={total > 0 ? 1 : 0.14}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  {total > 0 ? (
                    <>
                      <span className="text-[8.5px] font-bold text-zinc-500">
                        {diff > 0 ? '유리' : diff < 0 ? '불리' : '대등'}
                      </span>
                      <span
                        className={`font-mono text-[17px] font-black tabular-nums ${
                          diff > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : diff < 0
                              ? 'text-rose-500 dark:text-rose-400'
                              : 'text-zinc-500'
                        }`}
                      >
                        {diff > 0 ? '+' : ''}
                        {diff.toFixed(1)}
                      </span>
                      <span className="text-[8.5px] text-zinc-500">%p</span>
                    </>
                  ) : (
                    <span className="text-center text-[10px] font-bold leading-tight text-zinc-500">
                      상성
                      <br />
                      없음
                    </span>
                  )}
                </div>
              </div>
              {/* 양측 보정 라벨 */}
              <div className="mt-1.5 flex items-center justify-center gap-2 font-mono text-[11px] font-black tabular-nums">
                <span className="text-emerald-600 dark:text-emerald-400">+{myAdv.toFixed(1)}%</span>
                <span className="text-zinc-300 dark:text-zinc-700">|</span>
                <span className="text-rose-500 dark:text-rose-400">+{oppAdv.toFixed(1)}%</span>
              </div>
            </div>

            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-[11px] font-bold">{opp.nickname}</p>
              <div className="mt-1 flex justify-center">
                <Face src={opp.south} size={76} />
              </div>
              <AttrLines attrs={opp.attrs} />
            </div>
          </div>


          {pairs.length > 0 ? (
            <>
              <p className="mt-3 text-[10.5px] text-zinc-500">지역별 상성 기여</p>
              <div className="mt-1">
                <AttrPairChart pairs={pairs} />
              </div>
              <div className="mt-1 flex justify-center gap-4 text-[10px] text-zinc-500">
                <span>
                  <i className="mr-1 inline-block h-[3px] w-[9px] rounded-sm bg-emerald-500 align-middle" />
                  내 공격
                </span>
                <span>
                  <i className="mr-1 inline-block h-[3px] w-[9px] rounded-sm bg-rose-500 align-middle" />
                  상대 공격
                </span>
              </div>
            </>
          ) : (
            <p className="mt-3 rounded-xl bg-zinc-100 px-3 py-2 text-[11px] text-zinc-500 dark:bg-zinc-900">
              서로 상성에 걸리는 지역이 없어 양쪽 다 보정 0입니다.
            </p>
          )}

        </>
      ) : null}

      <button
        type="button"
        onClick={onClose}
        className="mt-3 w-full rounded-xl bg-zinc-100 py-2.5 text-sm font-bold text-zinc-600 active:opacity-70 dark:bg-zinc-800 dark:text-zinc-300"
      >
        닫기
      </button>
    </ModalShell>
  );
}
