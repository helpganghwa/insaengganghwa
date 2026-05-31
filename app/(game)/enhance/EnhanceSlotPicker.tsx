'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import type { Slot } from '@/lib/db/schema/equipment';
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder } from '@/components/RarityFrame';

import { startEnhance } from './actions';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

export type EnhanceCandidate = {
  id: string;
  code: string;
  name: string;
  slot: Slot;
  enhanceLevel: number;
  transcendLevel: number;
  isChampion: boolean;
  equipped: boolean;
};

/**
 * 강화소 빈 lane 버튼 → 팝업으로 후보 장비를 보여주고 선택 시 startEnhance.
 * lane 자동 배정(queueEnhance가 빈 lane 1/2 중 선택). 잠금·강화중은 후보에서 제외(서버 쿼리).
 */
export function EmptySlotButton({
  slot,
  candidates,
}: {
  slot: Slot;
  candidates: EnhanceCandidate[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[92px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 text-sm text-zinc-500 transition hover:border-amber-400 hover:bg-amber-50/40 dark:border-zinc-700 dark:hover:border-amber-700 dark:hover:bg-amber-950/20"
      >
        <span className="text-lg">＋</span> {SLOT_LABEL[slot]} 올려 강화
      </button>
      {open ? <EnhanceSlotPicker slot={slot} candidates={candidates} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function EnhanceSlotPicker({
  slot,
  candidates,
  onClose,
}: {
  slot: Slot;
  candidates: EnhanceCandidate[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pick = (id: string) => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const r = await startEnhance(id);
      if (r.status === 'error') {
        setError(r.message);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${SLOT_LABEL[slot]} 강화 등록`}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="max-h-[82dvh] w-full max-w-xs overflow-y-auto rounded-2xl bg-white p-3 shadow-[0_0_40px_rgba(245,158,11,0.18)] ring-1 ring-amber-700/40 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">{SLOT_LABEL[slot]} 강화 등록</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-base leading-none text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            aria-label="닫기"
          >
            ×
          </button>
        </header>
        <p className="mb-2 text-[10px] text-zinc-500">
          탭하면 빈 lane에 자동 등록됩니다 (잠금/강화중 제외).
        </p>

        {error ? (
          <p className="mb-2 rounded bg-red-50 px-2 py-1 text-[10px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {candidates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-xs text-zinc-500 dark:border-zinc-700">
            강화 가능한 {SLOT_LABEL[slot]}이 없습니다.
            <Link href="/gacha" className="mt-2 block text-[11px] text-amber-600 underline dark:text-amber-400">
              🎁 보급에서 획득 →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={pending}
                onClick={() => pick(c.id)}
                style={rarityBorderStyle(c.transcendLevel)}
                className={`relative flex aspect-square flex-col items-stretch overflow-hidden rounded-xl border-2 bg-white px-1 py-1 text-center disabled:opacity-40 dark:bg-zinc-950 ${
                  hasRarityBorder(c.transcendLevel) ? '' : 'border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <RarityFrame level={c.transcendLevel} />
                <div className="flex h-7 items-center justify-center">
                  <span className="text-xs font-semibold">+{c.enhanceLevel}</span>
                </div>
                <div className="flex flex-1 items-center justify-center">
                  <TranscendSprite
                    code={c.code}
                    slot={c.slot}
                    level={c.transcendLevel}
                    isChampion={c.isChampion}
                    size={48}
                    frameless
                  />
                </div>
                <div className="flex h-7 items-center justify-center px-0.5">
                  <span className="line-clamp-2 break-keep text-[10px] leading-tight text-zinc-600 dark:text-zinc-400">
                    {c.name}
                  </span>
                </div>
                {c.equipped ? (
                  <span className="absolute left-1 top-1 rounded-full bg-emerald-500/95 px-1 text-[8px] font-bold text-white">
                    장
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
