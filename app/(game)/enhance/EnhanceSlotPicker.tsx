'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { josa } from 'es-hangul';

import type { Slot } from '@/lib/db/schema/equipment';
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder, TranscendTag } from '@/components/RarityFrame';

import { useResourceToast } from '@/components/ResourceToast';
import { ModalShell } from '@/components/ModalShell';

import { startEnhance } from './actions';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

export type EnhanceCandidate = {
  id: string;
  code: string;
  name: string;
  slot: Slot;
  enhanceLevel: number;
  transcendLevel: number;
  championRank: number | null;
  equipped: boolean;
};

/**
 * 강화소 빈 lane 버튼 → 팝업으로 후보 장비를 보여주고 선택 시 startEnhance.
 * lane 자동 배정(queueEnhance가 빈 lane 1/2 중 선택). 잠금·강화중은 후보에서 제외(서버 쿼리).
 */
export function EmptySlotButton({
  slot,
  candidates,
  onOptimisticStart,
}: {
  slot: Slot;
  candidates: EnhanceCandidate[];
  /** 강화 등록 직후 SlotLane의 useOptimistic에 가짜 ActiveJob 주입. */
  onOptimisticStart?: (candidate: EnhanceCandidate) => void;
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
      {open ? (
        <EnhanceSlotPicker
          slot={slot}
          candidates={candidates}
          onClose={() => setOpen(false)}
          onOptimisticStart={onOptimisticStart}
        />
      ) : null}
    </>
  );
}

function EnhanceSlotPicker({
  slot,
  candidates,
  onClose,
  onOptimisticStart,
}: {
  slot: Slot;
  candidates: EnhanceCandidate[];
  onClose: () => void;
  onOptimisticStart?: (candidate: EnhanceCandidate) => void;
}) {
  const router = useRouter();
  const { showError } = useResourceToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // 정렬 — 인벤토리와 동일 3종(2026-07-19). 동률 2차 기준도 동일.
  const [sortBy, setSortBy] = useState<'enhance' | 'transcend' | 'name'>('enhance');
  const sorted = useMemo(() => {
    return [...candidates].sort((a, b) => {
      if (sortBy === 'enhance')
        return b.enhanceLevel - a.enhanceLevel || b.transcendLevel - a.transcendLevel || a.name.localeCompare(b.name, 'ko');
      if (sortBy === 'transcend')
        return b.transcendLevel - a.transcendLevel || b.enhanceLevel - a.enhanceLevel || a.name.localeCompare(b.name, 'ko');
      return a.name.localeCompare(b.name, 'ko');
    });
  }, [candidates, sortBy]);

  const pick = (id: string) => {
    if (pending) return;
    setError(null);
    const candidate = candidates.find((c) => c.id === id);
    startTransition(async () => {
      // 낙관 — 가짜 ActiveJob 즉시 표시(SlotLane.useOptimistic). 모달도 즉시 닫음.
      if (candidate) {
        onOptimisticStart?.(candidate);
        onClose();
      }
      // 실패는 반드시 사용자에게 보인다(유령 등록 사건 2026-07-06) — 모달이 이미 닫혀
      // 로컬 setError는 안 보이므로 전역 토스트 + refresh로 낙관 카드를 서버 상태로 되돌린다.
      try {
        const r = await startEnhance(id);
        if (r.status === 'error') {
          showError(`강화 등록 실패 — ${r.message}`);
          router.refresh();
          return;
        }
        // 성공 — startEnhance의 revalidatePath('/enhance')가 SlotLane prop(실제 잡)을 갱신하고
        // useOptimistic이 낙관 카드를 그 실제 잡으로 복귀시킨다(§11.7). 에러/전송실패만 아래 refresh 롤백.
      } catch {
        showError('강화 등록이 전송되지 않았어요. 슬롯 상태를 확인해 주세요.');
        router.refresh();
      }
    });
  };

  return (
    <ModalShell
      onClose={onClose}
      label={`${SLOT_LABEL[slot]} 강화 등록`}
      className="max-h-[82dvh] w-full max-w-xs overflow-y-auto rounded-2xl bg-white p-3 shadow-[0_0_40px_rgba(245,158,11,0.18)] ring-1 ring-amber-700/40 dark:bg-zinc-950"
    >
        <header className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{SLOT_LABEL[slot]} 강화 등록</h2>
          <div className="flex items-center gap-2">
            {/* 정렬 셀렉트 — 인벤토리와 동일 스타일(커스텀 ▼, iOS 색상·크롬 위치 이슈 회피). */}
            <span className="relative inline-flex items-center">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                aria-label="정렬 기준"
                className="appearance-none rounded-full border border-zinc-300 bg-transparent py-1 pl-2.5 pr-6 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400"
              >
                <option value="enhance">강화순</option>
                <option value="transcend">초월순</option>
                <option value="name">이름순</option>
              </select>
              <span aria-hidden className="pointer-events-none absolute right-2 text-[8px] text-zinc-400 dark:text-zinc-500">
                ▼
              </span>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-base leading-none text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        </header>
        <p className="mb-2 text-[10px] text-zinc-500">
          탭하면 빈 슬롯에 자동 등록됩니다 (잠금/강화중 제외).
        </p>

        {error ? (
          <p className="mb-2 rounded bg-red-50 px-2 py-1 text-[10px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {candidates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-xs text-zinc-500 dark:border-zinc-700">
            강화 가능한 {josa(SLOT_LABEL[slot], '이/가')} 없습니다.
            <Link prefetch={false} href="/gacha" className="mt-2 block text-[11px] text-amber-600 underline dark:text-amber-400">
              🎁 보급에서 획득
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {sorted.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={pending}
                onClick={() => pick(c.id)}
                style={rarityBorderStyle(c.transcendLevel)}
                className={`relative flex aspect-square flex-col items-center justify-center gap-0.5 isolate overflow-hidden rounded-xl border-2 bg-white px-1 text-center disabled:opacity-40 dark:bg-zinc-950 ${
                  hasRarityBorder(c.transcendLevel) ? '' : 'border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <RarityFrame level={c.transcendLevel} />
                <TranscendSprite
                  code={c.code}
                  slot={c.slot}
                  level={c.transcendLevel}
                  championRank={c.championRank}
                  size={48}
                  frameless
                />
                <span className="line-clamp-2 break-keep px-0.5 text-[10px] leading-tight text-zinc-600 dark:text-zinc-400">
                  {c.name}
                </span>
                <span className="text-xs font-semibold">
                  +{c.enhanceLevel}
                  {/* 초월 수치 명시 — 테두리만으론 교환 후보 비교가 어려움(2026-07-13 피드백). */}
                  {c.transcendLevel > 0 ? <TranscendTag level={c.transcendLevel} className="ml-1" /> : null}
                </span>
                {c.equipped ? (
                  <span className="absolute left-1 top-1 rounded-full bg-emerald-500/95 px-1 text-[8px] font-bold text-white">
                    장
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
    </ModalShell>
  );
}
