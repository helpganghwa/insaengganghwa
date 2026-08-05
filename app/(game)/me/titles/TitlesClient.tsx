'use client';

import { useMemo, useState, useTransition } from 'react';

import { TitleTag } from '@/components/TitleTag';
import { TITLE_BY_CODE, TITLE_DEFS } from '@/lib/game/titles/defs';
import { setRepresentativeTitleAction } from '@/lib/game/titles/actions';

/** 서버가 내려주는 행 — 조건(cond)은 발견한 칭호에만 존재(비노출 원칙). */
export type TitleRow = {
  code: string;
  cond: string | null;
  discovered: boolean;
  activeNow: boolean;
};

type Tri = null | 'a' | 'b';

/** 토글 세그먼트 — 모두 해제 = 전체(목업 확정 UX). */
function Seg({ a, b, val, onChange }: { a: string; b: string; val: Tri; onChange: (v: Tri) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-zinc-700">
      {(['a', 'b'] as const).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(val === k ? null : k)}
          className={`px-2.5 py-0.5 text-[11px] ${k === 'b' ? 'border-l border-zinc-700' : ''} ${
            val === k ? 'bg-amber-400 font-bold text-zinc-900' : 'text-zinc-400'
          }`}
        >
          {k === 'a' ? a : b}
        </button>
      ))}
    </div>
  );
}

export function TitlesClient({
  rows,
  representative,
  executorZone,
  executorZoneRegion,
}: {
  rows: TitleRow[];
  representative: string | null;
  executorZone: string | null;
  executorZoneRegion: string | null;
}) {
  const [rep, setRep] = useState(representative);
  const [kind, setKind] = useState<Tri>(null); // a=조건 b=영구
  const [found, setFound] = useState<Tri>(null); // a=발견 b=미발견
  const [act, setAct] = useState<Tri>(null); // a=활성 b=비활성
  const [pending, startTransition] = useTransition();

  const discoveredCount = useMemo(() => rows.filter((r) => r.discovered).length, [rows]);
  const byCode = useMemo(() => new Map(rows.map((r) => [r.code, r])), [rows]);

  const list = TITLE_DEFS.filter((d) => {
    const r = byCode.get(d.code);
    if (!r) return false;
    const isCond = d.kind === 'conditional';
    if (kind && (kind === 'a') !== isCond) return false;
    if (found && (found === 'a') !== r.discovered) return false;
    if (act && (act === 'a') !== r.activeNow) return false;
    return true;
  });

  const toggle = (code: string) => {
    const next = rep === code ? null : code;
    const prevRep = rep;
    setRep(next); // 낙관 반영 — 실패 시 복구
    startTransition(async () => {
      const res = await setRepresentativeTitleAction(next);
      if (!res.ok) setRep(prevRep);
    });
  };

  return (
    <div className="mx-auto w-full max-w-[390px]">
      {/* 상단 — 대표 미리보기+진행+필터 고정(스크롤은 목록만). main이 스크롤 컨테이너라 top-0. */}
      <div className="sticky top-0 z-20 bg-zinc-950">
      <div className="border-b border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-extrabold text-white">대표 칭호</span>
            {rep ? (
              <TitleTag code={rep} executorZone={executorZone} executorZoneRegion={executorZoneRegion} className="text-sm" />
            ) : (
              <span className="text-xs text-zinc-500">없음</span>
            )}
          </div>
          <span className="shrink-0 text-[11px] text-zinc-400">
            발견 {discoveredCount}/{rows.length}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-zinc-800">
          <div className="h-full bg-amber-400" style={{ width: `${(discoveredCount / rows.length) * 100}%` }} />
        </div>
      </div>

      {/* 필터 — 토글 세그먼트 3조(해제=전체) */}
      <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 px-4 py-2">
        <Seg a="조건" b="영구" val={kind} onChange={setKind} />
        <Seg a="발견" b="미발견" val={found} onChange={setFound} />
        <Seg a="활성" b="비활성" val={act} onChange={setAct} />
      </div>
      </div>

      {/* 목록 */}
      <div className="px-4 pb-8">
        {list.map((d) => {
          const r = byCode.get(d.code)!;
          const isCond = d.kind === 'conditional';
          const isRep = rep === d.code;
          return (
            <div key={d.code} className="flex items-center gap-2 border-b border-zinc-800/70 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.discovered ? (
                    <TitleTag code={d.code} executorZone={executorZone} executorZoneRegion={executorZoneRegion} className="text-[15px]" />
                  ) : (
                    <span className="text-[14px] font-semibold text-zinc-600">
                      {TITLE_BY_CODE.get(d.code)?.label}
                    </span>
                  )}
                  <span
                    className={`rounded px-1 text-[10px] font-extrabold ${
                      isCond ? 'bg-purple-900/40 text-purple-300' : 'bg-sky-900/40 text-sky-300'
                    }`}
                  >
                    {isCond ? '조건' : '영구'}
                  </span>
                  {r.discovered && isCond && (
                    <span
                      className={`rounded px-1 text-[10px] font-extrabold ${
                        r.activeNow ? 'bg-emerald-900/40 text-emerald-300' : 'bg-orange-950/60 text-orange-300'
                      }`}
                    >
                      {r.activeNow ? '활성' : '비활성'}
                    </span>
                  )}
                  {isRep && <span className="rounded bg-amber-900/50 px-1 text-[10px] font-extrabold text-amber-300">대표</span>}
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500">{r.cond ?? '???'}</div>
              </div>
              {r.activeNow && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => toggle(d.code)}
                  className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold ${
                    isRep
                      ? 'border-amber-400 bg-amber-400 text-zinc-900'
                      : 'border-zinc-700 text-zinc-200'
                  }`}
                >
                  {isRep ? '해제' : '장착'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
