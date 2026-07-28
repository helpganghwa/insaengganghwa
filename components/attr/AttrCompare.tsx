// 클라이언트 전용 — 'use client' 미부착(ProfileSelector 클라 그래프에 포함).
import { useMemo, useState, useTransition } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { runeVectorDesc } from '@/components/RuneName';
import {
  ATTR_REGION_COLOR,
  ATTR_REGION_KO,
  AVATAR_ATTR_TOTAL_MAX,
  attrAdvantagePct,
  attrDisplayVector,
  attrPrey,
  AVATAR_ATTR_REGIONS,
  type AttrRegion,
  type AvatarAttr,
} from '@/lib/game/balance';

import { searchOpponentAction, type OpponentResult } from './actions';

/** 아바타 + 속성 한 칸 — 좌(나) / 우(상대) 공용. */
function Side({
  label,
  nickname,
  south,
  attrs,
  accent,
}: {
  label: string;
  nickname: string;
  south: string | null;
  attrs: AvatarAttr[];
  accent: string;
}) {
  const vec = runeVectorDesc(attrs);
  return (
    <div className="flex-1">
      <p className="text-[9.5px] font-black tracking-wide" style={{ color: accent }}>
        {label}
      </p>
      <div className="mt-1 flex h-[86px] items-end justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900">
        {south ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={south}
            alt=""
            draggable={false}
            className="h-full w-full object-contain object-bottom"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <span className="pb-6 text-[11px] text-zinc-400">?</span>
        )}
      </div>
      <p className="mt-1 truncate text-center text-[11px] font-bold">{nickname}</p>
      <div className="mt-0.5 flex flex-col items-center gap-[1px]">
        {vec.length > 0 ? (
          vec.map(([r, v]) => (
            <span
              key={r}
              className="text-[10px] font-extrabold tabular-nums"
              style={{ color: ATTR_REGION_COLOR[r] }}
            >
              {ATTR_REGION_KO[r]} {v}%
            </span>
          ))
        ) : (
          <span className="text-[10px] text-zinc-400">속성 없음</span>
        )}
      </div>
    </div>
  );
}

/**
 * 상성 대결 — 좌: 내 아바타 / 우: 검색해 고른 상대. 하단에 양측 보정과 우열.
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
  /** 남의 프로필에서 열면 상대가 고정(검색 단계 없음). */
  fixedOpponent?: OpponentResult | null;
}) {
  const attrs = myAttrs;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<OpponentResult[] | null>(null);
  const [opp, setOpp] = useState<OpponentResult | null>(fixedOpponent);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const mineVec = useMemo(() => attrDisplayVector(attrs), [attrs]);
  const oppVec = useMemo(() => attrDisplayVector(opp?.attrs ?? []), [opp]);
  const myAdv = attrAdvantagePct(mineVec, oppVec);
  const oppAdv = attrAdvantagePct(oppVec, mineVec);
  const diff = myAdv - oppAdv;

  const parts = AVATAR_ATTR_REGIONS.flatMap((r) => {
    const my = mineVec[r] ?? 0;
    const op = oppVec[attrPrey(r)] ?? 0;
    if (my <= 0 || op <= 0) return [];
    return [{ r, prey: attrPrey(r) as AttrRegion, my, op, gain: (my * op) / AVATAR_ATTR_TOTAL_MAX }];
  });

  const search = () => {
    if (pending) return;
    setErr(null);
    startTransition(async () => {
      const r = await searchOpponentAction(q);
      if (r.status === 'error') {
        setErr(r.message);
        return;
      }
      setResults(r.results);
    });
  };

  return (
    <ModalShell
      onClose={onClose}
      label="상성 대결"
      className="max-h-[86dvh] w-full max-w-[320px] overflow-y-auto rounded-2xl bg-white p-4 dark:bg-zinc-950"
    >
      <h2 className="text-[15px] font-bold">상성 대결</h2>

      {/* 좌: 나 / 우: 상대 */}
      <div className="mt-3 flex items-start gap-2">
        <Side label="나" nickname={myNickname} south={mySouth} attrs={attrs} accent="#a1a1aa" />
        <span className="mt-[38px] shrink-0 text-[11px] font-black text-zinc-400">VS</span>
        {opp ? (
          <Side
            label="상대"
            nickname={opp.nickname}
            south={opp.south}
            attrs={opp.attrs}
            accent="#a1a1aa"
          />
        ) : (
          <div className="flex-1">
            <p className="text-[9.5px] font-black tracking-wide text-zinc-400">상대</p>
            <div className="mt-1 flex h-[86px] items-center justify-center rounded-xl border border-dashed border-zinc-300 text-[10.5px] text-zinc-400 dark:border-zinc-700">
              검색해서 선택
            </div>
          </div>
        )}
      </div>

      {/* 결과 */}
      {opp ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-emerald-500/10 py-2 text-center">
              <p className="text-[9.5px] font-bold text-emerald-600 dark:text-emerald-400">내 공격</p>
              <p className="font-mono text-[18px] font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                +{myAdv.toFixed(1)}%
              </p>
            </div>
            <div className="rounded-xl bg-rose-500/10 py-2 text-center">
              <p className="text-[9.5px] font-bold text-rose-500 dark:text-rose-400">상대 공격</p>
              <p className="font-mono text-[18px] font-black tabular-nums text-rose-500 dark:text-rose-400">
                +{oppAdv.toFixed(1)}%
              </p>
            </div>
          </div>
          <p className="mt-1.5 text-center text-[12px] font-black">
            {Math.abs(diff) < 0.05 ? (
              <span className="text-zinc-500">대등</span>
            ) : diff > 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                내가 {diff.toFixed(1)}%p 유리
              </span>
            ) : (
              <span className="text-rose-500 dark:text-rose-400">
                내가 {Math.abs(diff).toFixed(1)}%p 불리
              </span>
            )}
          </p>

          {parts.length > 0 ? (
            <div className="mt-2.5 flex flex-col gap-1 rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
              {parts.map((p) => (
                <p key={p.r} className="font-mono text-[10.5px] tabular-nums">
                  <span style={{ color: ATTR_REGION_COLOR[p.r] }}>{ATTR_REGION_KO[p.r]} {p.my}</span>
                  <span className="text-zinc-400"> × </span>
                  <span style={{ color: ATTR_REGION_COLOR[p.prey] }}>
                    {ATTR_REGION_KO[p.prey]} {p.op}
                  </span>
                  <span className="text-zinc-400"> ÷ {AVATAR_ATTR_TOTAL_MAX} = </span>
                  <b className="text-emerald-600 dark:text-emerald-400">+{p.gain.toFixed(1)}%</b>
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-2.5 rounded-xl bg-zinc-100 px-3 py-2 text-[11px] text-zinc-500 dark:bg-zinc-900">
              상대가 내 먹잇감 권역을 갖고 있지 않아 보정 0.
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
              className="mt-2.5 w-full rounded-xl bg-zinc-100 py-2 text-[12px] font-bold text-zinc-600 active:opacity-70 dark:bg-zinc-800 dark:text-zinc-300"
            >
              다른 상대 검색
            </button>
          ) : null}
        </>
      ) : (
        <>
          <div className="mt-3 flex gap-1.5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') search();
              }}
              placeholder="닉네임 또는 코드"
              maxLength={30}
              className="min-w-0 flex-1 rounded-xl bg-zinc-100 px-3 py-2 text-[13px] outline-none placeholder:text-zinc-400 dark:bg-zinc-900"
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
                {results.map((r) => {
                  const vec = runeVectorDesc(r.attrs);
                  return (
                    <li key={r.userId}>
                      <button
                        type="button"
                        onClick={() => setOpp(r)}
                        className="flex w-full items-center gap-2 rounded-xl bg-zinc-100 p-1.5 text-left active:opacity-70 dark:bg-zinc-900"
                      >
                        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-800">
                          {r.south ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.south}
                              alt=""
                              className="h-full w-full object-contain object-bottom"
                              style={{ imageRendering: 'pixelated' }}
                            />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-bold">{r.nickname}</span>
                          <span className="block truncate text-[10px] font-bold">
                            {vec.length > 0 ? (
                              vec.map(([k, v], i) => (
                                <span key={k} style={{ color: ATTR_REGION_COLOR[k] }}>
                                  {i > 0 ? ' · ' : ''}
                                  {ATTR_REGION_KO[k]} {v}%
                                </span>
                              ))
                            ) : (
                              <span className="text-zinc-400">속성 없음</span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
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
