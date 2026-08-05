'use client';

import { useMemo, useState, useTransition } from 'react';

import { TitleTag } from '@/components/TitleTag';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { TITLE_BY_CODE, TITLE_DEFS } from '@/lib/game/titles/defs';
import { setRepresentativeTitleAction } from '@/lib/game/titles/actions';
import { useResourceToast } from '@/components/ResourceToast';

/** 서버가 내려주는 행 — 조건(cond)·발견일은 발견한 칭호에만 존재(비노출 원칙). */
export type TitleRow = {
  code: string;
  cond: string | null;
  discovered: boolean;
  earnedAt: string | null;
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

/** 카드 상태 — 테두리가 상태를 말한다(도감 그리드 확정안): 금=대표·점선=미발견·주황 꼬리=비활성. */
type CardState = 'rep' | 'active' | 'inactive' | 'locked';
const CARD_CLS: Record<CardState, string> = {
  rep: 'border-amber-400 shadow-[0_0_0_1px_rgba(251,191,36,0.9),inset_0_0_14px_rgba(216,178,95,0.18)]',
  active: 'border-zinc-600',
  inactive: 'border-orange-700/50 opacity-80',
  locked: 'border-dashed border-zinc-800 bg-zinc-950/60 opacity-85',
};
const STATE_ORDER: Record<CardState, number> = { rep: 0, active: 1, inactive: 2, locked: 3 };

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
  const [sel, setSel] = useState<string | null>(null); // 팝업 대상 code
  const [pending, startTransition] = useTransition();
  const { showError, showHeaderToast } = useResourceToast();

  const discoveredCount = useMemo(() => rows.filter((r) => r.discovered).length, [rows]);
  const byCode = useMemo(() => new Map(rows.map((r) => [r.code, r])), [rows]);

  const stateOf = (code: string): CardState => {
    const r = byCode.get(code);
    if (!r?.discovered) return 'locked';
    if (code === rep) return 'rep';
    return r.activeNow ? 'active' : 'inactive';
  };

  // 정렬: 내 컬렉션 먼저(대표→활성→비활성), 미발견은 뒤 — 도감 확정안.
  const list = useMemo(
    () =>
      TITLE_DEFS.filter((d) => {
        const r = byCode.get(d.code);
        if (!r) return false;
        const isCond = d.kind === 'conditional';
        if (kind && (kind === 'a') !== isCond) return false;
        if (found && (found === 'a') !== r.discovered) return false;
        if (act && (act === 'a') !== r.activeNow) return false;
        return true;
      }).sort((a, b) => STATE_ORDER[stateOf(a.code)] - STATE_ORDER[stateOf(b.code)]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byCode, kind, found, act, rep],
  );

  const toggle = (code: string) => {
    const next = rep === code ? null : code;
    const prevRep = rep;
    const label = TITLE_BY_CODE.get(code)?.label ?? '';
    setRep(next); // 낙관 반영 — 실패 시 복구
    setSel(null); // 팝업 즉시 닫고 결과는 공용 토스트로(사용자 확정)
    window.dispatchEvent(new CustomEvent('ig:reptitle', { detail: next })); // 채팅 등 낙관 동기화
    showHeaderToast({ title: next ? '칭호 장착' : '칭호 해제', detail: label });
    startTransition(async () => {
      const res = await setRepresentativeTitleAction(next);
      if (!res.ok) {
        setRep(prevRep);
        window.dispatchEvent(new CustomEvent('ig:reptitle', { detail: prevRep }));
        showError(next ? '칭호 장착에 실패했어' : '칭호 해제에 실패했어');
      }
    });
  };

  const selRow = sel ? byCode.get(sel) : null;
  const selDef = sel ? TITLE_BY_CODE.get(sel) : null;

  return (
    <div className="mx-auto w-full max-w-[390px]">
      {/* 상단 — 대표 미리보기+진행+필터 고정(스크롤은 그리드만). main이 스크롤 컨테이너라 top-0. */}
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

      {/* 도감 그리드 — 2열 카드. 상태는 테두리로, 조건·장착은 카드 탭 → 공통 팝업. */}
      <div className="grid grid-cols-2 gap-2 px-3 py-3 pb-8">
        {list.map((d) => {
          const st = stateOf(d.code);
          return (
            <button
              key={d.code}
              type="button"
              onClick={() => setSel(d.code)}
              className={`relative flex min-h-[58px] items-center justify-center overflow-hidden rounded-xl border bg-zinc-900 px-2 py-2.5 ${CARD_CLS[st]}`}
            >
              {st === 'rep' && (
                <span className="absolute left-1.5 top-1 text-[9px] font-extrabold text-amber-400">대표</span>
              )}
              {st === 'inactive' && (
                <span className="absolute right-1.5 top-1 text-[9px] font-bold text-orange-400">비활성</span>
              )}
              <span className="max-w-full overflow-hidden text-ellipsis">
                {byCode.get(d.code)?.discovered ? (
                  <TitleTag
                    code={d.code}
                    executorZone={executorZone}
                    executorZoneRegion={executorZoneRegion}
                    className="text-[13px]"
                  />
                ) : (
                  <span className="whitespace-nowrap text-[12.5px] font-semibold text-zinc-600">{d.label}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* 상세 — 공통 팝업(ModalShell+ModalLayout). 발견일은 여기서만 노출(목록엔 없음, 사용자 확정). */}
      {sel && selRow && selDef && (
        <ModalShell onClose={() => setSel(null)} label={`칭호 ${selDef.label}`}>
          <ModalLayout
            title={
              selRow.discovered ? (
                <TitleTag
                  code={sel}
                  executorZone={executorZone}
                  executorZoneRegion={executorZoneRegion}
                  className="text-[19px]"
                />
              ) : (
                <span className="text-[17px] font-semibold text-zinc-500">{selDef.label}</span>
              )
            }
            subtitle={
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`rounded px-1 text-[10px] font-extrabold ${
                    selDef.kind === 'conditional' ? 'bg-purple-900/40 text-purple-300' : 'bg-sky-900/40 text-sky-300'
                  }`}
                >
                  {selDef.kind === 'conditional' ? '조건' : '영구'}
                </span>
                {selRow.discovered && selDef.kind === 'conditional' && (
                  <span
                    className={`rounded px-1 text-[10px] font-extrabold ${
                      selRow.activeNow ? 'bg-emerald-900/40 text-emerald-300' : 'bg-orange-950/60 text-orange-300'
                    }`}
                  >
                    {selRow.activeNow ? '활성' : '비활성'}
                  </span>
                )}
              </span>
            }
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setSel(null)}>
                  닫기
                </ModalButton>
                {selRow.activeNow && (
                  <ModalButton tone={rep === sel ? 'neutral' : 'primary'} disabled={pending} onClick={() => toggle(sel)}>
                    {rep === sel ? '해제' : '장착'}
                  </ModalButton>
                )}
              </>
            }
          >
            <div className="space-y-2 text-center">
              <div className="text-[12.5px] leading-relaxed text-zinc-300">{selRow.cond ?? '???'}</div>
              <div className="text-[11px] text-zinc-500">
                {selRow.earnedAt ? `${selRow.earnedAt} 발견` : '미발견'}
              </div>
            </div>
          </ModalLayout>
        </ModalShell>
      )}
    </div>
  );
}
