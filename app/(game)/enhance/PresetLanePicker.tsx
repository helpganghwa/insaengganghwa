'use client';

import { useMemo, useState } from 'react';

import type { Slot } from '@/lib/db/schema/equipment';
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder, TranscendTag } from '@/components/RarityFrame';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { ZoomSafeSelect } from '@/components/ui/ZoomSafeField';
import { SLOT_LABEL, laneNoOfLaneKey, slotOfLaneKey, type LaneKey, type PresetLaneState } from '@/lib/game/enhance/preset-plan';

import type { PresetEquipment } from './preset-actions';

/** 정렬 — 강화 등록 피커와 같은 다섯 가지(EnhanceSlotPicker). 기기 기억도 같은 키를 쓴다. */
const SORTS = [
  ['enhance_desc', '강화 높은순'],
  ['enhance_asc', '강화 낮은순'],
  ['transcend_desc', '초월 높은순'],
  ['transcend_asc', '초월 낮은순'],
  ['name', '이름순'],
] as const;
type SortKey = (typeof SORTS)[number][0];
const SORT_STORAGE_KEY = 'ig:enhance-pick-sort';
function loadSort(): SortKey {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(SORT_STORAGE_KEY) : null;
    return SORTS.some(([k]) => k === raw) ? (raw as SortKey) : 'enhance_desc';
  } catch {
    return 'enhance_desc';
  }
}
function saveSort(v: SortKey) {
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, v);
  } catch {
    /* 저장 못 해도 이번 팝업 안에서는 적용 */
  }
}

const TILE =
  'relative flex aspect-square flex-col items-center justify-center gap-0.5 isolate overflow-hidden rounded-xl border-2 bg-white px-1 text-center transition active:scale-[0.98] dark:bg-zinc-950';

/**
 * 프리셋 칸 선택 — 강화 등록 피커(3열 타일)와 같은 생김새에 옵션 타일 2개('현재 장비 유지'·'비우기')를 앞에 둔다.
 * 진행 중인 장비도 고를 수 있다(적용 때 그 칸에서 옮겨 온다). 고르면 바로 닫히고 상위가 저장한다.
 */
export function PresetLanePicker({
  laneKey,
  presetName,
  current,
  equipment,
  onPick,
  onClose,
}: {
  laneKey: LaneKey;
  presetName: string;
  current: PresetLaneState;
  /** 이 칸 부위의 내 장비 전부. */
  equipment: PresetEquipment[];
  onPick: (state: PresetLaneState) => void;
  onClose: () => void;
}) {
  const slot: Slot = slotOfLaneKey(laneKey);
  const [sort, setSort] = useState<SortKey>(loadSort);
  const sorted = useMemo(() => {
    const d = sort.endsWith('_asc') ? -1 : 1;
    return [...equipment].sort((a, b) => {
      if (sort.startsWith('enhance'))
        return d * (b.enhanceLevel - a.enhanceLevel) || d * (b.transcendLevel - a.transcendLevel) || a.name.localeCompare(b.name, 'ko');
      if (sort.startsWith('transcend'))
        return d * (b.transcendLevel - a.transcendLevel) || d * (b.enhanceLevel - a.enhanceLevel) || a.name.localeCompare(b.name, 'ko');
      return a.name.localeCompare(b.name, 'ko');
    });
  }, [equipment, sort]);
  const selectedId = current.kind === 'item' ? current.equipmentId : null;

  return (
    <ModalShell onClose={onClose} label={`${SLOT_LABEL[slot]} ${laneNoOfLaneKey(laneKey)}칸에 올릴 장비`} stacked>
      <ModalLayout
        title={`${SLOT_LABEL[slot]} ${laneNoOfLaneKey(laneKey)}칸에 올릴 장비`}
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            {presetName} · 유지·비우기도 고를 수 있어요
            <ZoomSafeSelect
              value={sort}
              onChange={(e) => {
                const v = e.target.value as SortKey;
                setSort(v);
                saveSort(v);
              }}
              aria-label="정렬"
              wrapClassName="inline-block h-[26px] w-[106px] shrink-0 align-middle"
              className="rounded-full border border-zinc-300 bg-transparent pl-2.5 pr-6 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400"
            >
              {SORTS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </ZoomSafeSelect>
          </span>
        }
        maxBodyClass="max-h-[62vh]"
        footer={
          <ModalButton tone="ghost" onClick={onClose}>
            닫기
          </ModalButton>
        }
      >
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onPick({ kind: 'keep' })}
            className={`${TILE} ${current.kind === 'keep' ? 'border-amber-400' : 'border-zinc-200 dark:border-zinc-700'}`}
          >
            <span className="text-xl leading-none text-zinc-400">⟳</span>
            <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">현재 장비 유지</span>
            <span className="text-[9px] text-zinc-400 dark:text-zinc-600">적용 때 그대로</span>
          </button>
          <button
            type="button"
            onClick={() => onPick({ kind: 'empty' })}
            className={`${TILE} ${current.kind === 'empty' ? 'border-amber-400' : 'border-red-200 dark:border-red-900/70'}`}
          >
            <span className="text-xl leading-none text-red-400/80">－</span>
            <span className="text-[10px] font-semibold text-red-500 dark:text-red-300/90">비우기</span>
            <span className="text-[9px] text-zinc-400 dark:text-zinc-600">강화 취소</span>
          </button>
          {sorted.map((c) => {
            const on = c.id === selectedId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick({ kind: 'item', equipmentId: c.id })}
                style={on ? undefined : rarityBorderStyle(c.transcendLevel)}
                className={`${TILE} ${on ? 'border-amber-400' : hasRarityBorder(c.transcendLevel) ? '' : 'border-zinc-200 dark:border-zinc-800'}`}
              >
                <RarityFrame level={c.transcendLevel} />
                <TranscendSprite code={c.code} slot={c.slot} level={c.transcendLevel} championRank={c.championRank} size={48} frameless />
                <span className="line-clamp-2 break-keep px-0.5 text-[10px] leading-tight text-zinc-600 dark:text-zinc-400">{c.name}</span>
                <span className="text-xs font-semibold">
                  +{c.enhanceLevel}
                  {c.transcendLevel > 0 ? <TranscendTag level={c.transcendLevel} className="ml-1" /> : null}
                </span>
                {on ? (
                  <span className="absolute left-1 top-1 rounded-full bg-amber-500 px-1 text-[8px] font-bold text-black">선택</span>
                ) : c.equipped ? (
                  <span className="absolute left-1 top-1 rounded-full bg-emerald-500/95 px-1 text-[8px] font-bold text-white">장</span>
                ) : null}
              </button>
            );
          })}
        </div>
        {equipment.length === 0 ? (
          <div className="mt-2 rounded-lg border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500 dark:border-zinc-700">
            보유한 {SLOT_LABEL[slot]}가 없어요.
          </div>
        ) : null}
      </ModalLayout>
    </ModalShell>
  );
}
