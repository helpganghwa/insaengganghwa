// 클라이언트 전용 — 'use client' 미부착(부모 클라 그래프에 포함).
import dynamic from 'next/dynamic';
import { useMemo, useState, useTransition } from 'react';

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

import { searchOpponentAction, type OpponentResult } from './actions';
import { PAIR_ROW_H, type Pair } from './AttrPairChart';

const AttrPairChart = dynamic(() => import('./AttrPairChart').then((m) => m.AttrPairChart), {
  ssr: false,
  loading: () => <div style={{ height: PAIR_ROW_H }} />,
});

/** 지역 수치 한 줄 — `천사 59% · 화산 32%`. */
function AttrLine({ attrs, className = '' }: { attrs: AvatarAttr[]; className?: string }) {
  const vec = runeVectorDesc(attrs);
  if (vec.length === 0) return <span className={`text-zinc-400 ${className}`}>속성 없음</span>;
  return (
    <span className={className}>
      {vec.map(([r, v], i) => (
        <span key={r} style={{ color: ATTR_REGION_COLOR[r] }}>
          {i > 0 ? ' · ' : ''}
          {ATTR_REGION_KO[r]} {v}%
        </span>
      ))}
    </span>
  );
}

function Face({ src, size = 52 }: { src: string | null; size?: number }) {
  return (
    <span
      className="flex items-end justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900"
      style={{ width: size, height: size }}
    >
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
  fixedOpponent = null,
}: {
  onClose: () => void;
  myAttrs: AvatarAttr[];
  myNickname: string;
  mySouth: string | null;
  /** 남의 프로필에서 열면 상대 고정(검색 단계 없음). */
  fixedOpponent?: OpponentResult | null;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<OpponentResult[] | null>(null);
  const [opp, setOpp] = useState<OpponentResult | null>(fixedOpponent);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  const search = () => {
    if (pending) return;
    setErr(null);
    startTransition(async () => {
      const r = await searchOpponentAction(q);
      if (r.status === 'error') return setErr(r.message);
      setResults(r.results);
    });
  };

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
              <AttrLine attrs={myAttrs} className="mt-1 block text-[10px] font-bold leading-[1.4]" />
            </div>

            <div className="relative mt-3 h-[104px] w-[104px] shrink-0">
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
                    <span className="font-mono text-[14px] font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                      +{myAdv.toFixed(1)}%
                    </span>
                    <span className="my-[3px] block h-px w-7 bg-zinc-300 dark:bg-zinc-700" />
                    <span className="font-mono text-[14px] font-black tabular-nums text-rose-500 dark:text-rose-400">
                      +{oppAdv.toFixed(1)}%
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] font-bold text-zinc-500">상성 없음</span>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-[11px] font-bold">{opp.nickname}</p>
              <div className="mt-1 flex justify-center">
                <Face src={opp.south} size={76} />
              </div>
              <AttrLine attrs={opp.attrs} className="mt-1 block text-[10px] font-bold leading-[1.4]" />
            </div>
          </div>

          {total > 0 ? (
            <p className="mt-2 text-center text-[11.5px] font-black">
              {diff > 0 ? (
                <span className="text-emerald-600 dark:text-emerald-400">
                  내가 {diff.toFixed(1)}%p 유리
                </span>
              ) : diff < 0 ? (
                <span className="text-rose-500 dark:text-rose-400">
                  내가 {Math.abs(diff).toFixed(1)}%p 불리
                </span>
              ) : (
                <span className="text-zinc-500">대등</span>
              )}
            </p>
          ) : null}

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

          {fixedOpponent == null ? (
            <button
              type="button"
              onClick={() => {
                setOpp(null);
                setResults(null);
                setQ('');
              }}
              className="mt-3 w-full rounded-xl bg-zinc-100 py-2 text-[12px] font-bold text-zinc-600 active:opacity-70 dark:bg-zinc-800 dark:text-zinc-300"
            >
              다른 상대 검색
            </button>
          ) : null}
        </>
      ) : (
        <>
          <div className="mt-3 flex gap-1.5">
            {/* iOS는 16px 미만 인풋에 포커스하면 자동 확대 — 반드시 16px 이상 유지. */}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') search();
              }}
              placeholder="닉네임 또는 코드"
              maxLength={30}
              className="min-w-0 flex-1 rounded-xl bg-zinc-100 px-3 py-2 text-[16px] outline-none placeholder:text-zinc-400 dark:bg-zinc-900"
            />
            <button
              type="button"
              onClick={search}
              disabled={pending || !q.trim()}
              className="shrink-0 rounded-xl bg-amber-600 px-4 text-[13px] font-bold text-white active:opacity-90 disabled:opacity-50"
            >
              검색
            </button>
          </div>
          {err ? <p className="mt-2 text-[11px] font-bold text-rose-500">{err}</p> : null}
          {results != null ? (
            results.length === 0 ? (
              <p className="mt-3 text-center text-[11.5px] text-zinc-500">결과가 없습니다.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {results.map((r) => (
                  <li key={r.userId}>
                    <button
                      type="button"
                      onClick={() => setOpp(r)}
                      className="flex w-full items-center gap-2 rounded-xl bg-zinc-100 p-1.5 text-left active:opacity-70 dark:bg-zinc-900"
                    >
                      <Face src={r.south} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-bold">{r.nickname}</span>
                        <AttrLine attrs={r.attrs} className="block truncate text-[10px] font-bold" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </>
      )}

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
