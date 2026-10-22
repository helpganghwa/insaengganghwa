'use client';

import { useEffect, useState } from 'react';

import { LANE_KEYS, planPreset, presetDisplayName, type EnhancePreset, type RunningLanes } from '@/lib/game/enhance/preset-plan';

import { PresetModal, prefetchPresets, type PresetOpen } from './PresetModal';

export type PresetSummary = { presets: EnhancePreset[]; running: RunningLanes };

/**
 * 강화 프리셋 진입 줄(10-21 결정 E6) — 헤더 바로 아래 고정, 프리셋 3개가 이름 칩으로 보인다.
 * 칩을 누르면 그 프리셋의 적용 확인(바뀌는 칸이 없으면 편집)으로, 오른쪽 '편집'은 세트 카드 목록으로.
 * 서버가 그린 요약(이름·칸·지금 올라간 것)으로 시작하고, 팝업이 새 데이터를 받을 때마다 갱신한다.
 */
export function PresetBar({ initial }: { initial: PresetSummary }) {
  const [summary, setSummary] = useState(initial);
  const [base, setBase] = useState(initial);
  // 서버가 다시 그리면(적용·강화 완료 뒤 revalidate) 서버 값이 진실 — 팝업은 그대로 두고 요약만 되돌린다.
  if (initial !== base) {
    setBase(initial);
    setSummary(initial);
  }
  const [open, setOpen] = useState<PresetOpen | null>(null);
  // 팝업은 데이터가 있어야 그리므로, 줄이 뜨고 조금 뒤 한 번 미리 읽어 둔다(신선한 캐시가 있으면 생략).
  // 마운트 때 한 번만 — 강화 동작마다 서버가 다시 그릴 때는 읽지 않는다(핫패스에 조회를 더 얹지 않으려고, 열 때 새로 읽는다).
  useEffect(() => {
    const t = setTimeout(() => void prefetchPresets(initial.running), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회
  }, []);
  return (
    <>
      <div className="sticky top-0 z-20 flex h-10 shrink-0 items-center gap-1.5 border-b border-zinc-200 bg-white/95 px-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <button type="button" onClick={() => setOpen({ step: 'list' })} className="mr-0.5 shrink-0 text-[11px] font-semibold text-zinc-500">
          프리셋
        </button>
        {summary.presets.map((p) => {
          const hasItem = LANE_KEYS.some((k) => p.lanes[k]?.kind === 'item');
          const active = hasItem && planPreset(p.lanes, summary.running).changed === 0;
          return (
            <button
              key={p.presetNo}
              type="button"
              onClick={() => setOpen({ step: 'confirm', presetNo: p.presetNo })}
              className={`min-w-0 truncate rounded-full border px-2.5 py-1 text-[11px] font-bold transition active:scale-[0.97] ${
                active
                  ? 'border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                  : hasItem
                    ? 'border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                    : 'border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500'
              }`}
            >
              {presetDisplayName(p)}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen({ step: 'list' })}
          className="ml-auto shrink-0 py-1 pl-2 text-[11px] font-bold text-amber-600 dark:text-amber-400"
        >
          편집
        </button>
      </div>
      {open ? (
        <PresetModal
          open={open}
          serverRunning={initial.running}
          onClose={() => setOpen(null)}
          onData={(d) => setSummary({ presets: d.presets, running: d.running })}
        />
      ) : null}
    </>
  );
}
