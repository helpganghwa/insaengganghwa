'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { Slot } from '@/lib/db/schema/equipment';
import {
  pieceCombatPower,
  transcendFodderForStep,
  MAX_TRANSCEND,
  DIAMOND_PER_DISENCHANT,
  FODDER_REQUIRED_FROM_LEVEL,
} from '@/lib/game/balance';
import { formatCompactKR } from '@/lib/ui/format-number';

import type { InvItem } from './InventoryGrid';
import {
  equipAction,
  unequipAction,
  toggleLockAction,
  transcendAction,
  disenchantAction,
} from './actions';
import { startEnhance } from '@/app/(game)/enhance/actions';
import { BoastModal } from '@/components/BoastModal';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

export function EquipmentDetailSheet({
  item,
  all,
  nickname,
  onClose,
}: {
  item: InvItem;
  all: InvItem[];
  nickname: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmT, setConfirmT] = useState(false);
  const [confirmD, setConfirmD] = useState(false);
  const [boast, setBoast] = useState(false);

  const cp = pieceCombatPower(item.enhanceLevel, item.transcendLevel);
  const equippedInSlot = !item.equipped
    ? all.find((i) => i.slot === item.slot && i.equipped) ?? null
    : null;
  const eqCp = equippedInSlot
    ? pieceCombatPower(equippedInSlot.enhanceLevel, equippedInSlot.transcendLevel)
    : null;

  const atMax = item.transcendLevel >= MAX_TRANSCEND;
  const nextT = item.transcendLevel + 1;
  const fodderNeed = atMax ? 0 : transcendFodderForStep(nextT);
  const fodderOwned = all.filter(
    (i) =>
      i.catalogItemId === item.catalogItemId &&
      i.id !== item.id &&
      !i.equipped &&
      !i.isLocked &&
      !i.busy,
  ).length;
  const canTranscend = !atMax && fodderOwned >= fodderNeed;
  const canDisenchant = !item.equipped && !item.isLocked && !item.busy;
  const needsFodderEnhance = item.enhanceLevel >= FODDER_REQUIRED_FROM_LEVEL;

  const run = (fn: () => Promise<{ status: string; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (r.status === 'error') setError(r.message ?? '오류');
      else {
        after?.();
        router.refresh();
      }
    });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="장비 상세"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-xs overflow-y-auto rounded-2xl bg-white p-3 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="text-center">
          <div className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
            ✦T{item.transcendLevel} · {SLOT_LABEL[item.slot]}
          </div>
          <h2 className="mt-0.5 text-sm font-semibold">
            {item.name} <span className="text-zinc-400">+{item.enhanceLevel}</span>
          </h2>
          <div className="mt-1 flex justify-center gap-2 text-[10px]">
            {item.isLocked ? <span className="text-amber-600">🔒 잠금</span> : null}
            {item.equipped ? <span className="text-green-600">✓ 장착 중</span> : null}
          </div>
        </header>

        <section className="mt-2 flex items-center gap-3 rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
          <span className="text-3xl">
            {item.slot === 'weapon' ? '⚔️' : item.slot === 'armor' ? '🛡️' : '💍'}
          </span>
          <div>
            <div className="text-[10px] text-zinc-500">⚔️ 전투력</div>
            <div className="text-sm font-semibold tabular-nums">{formatCompactKR(cp)}</div>
          </div>
        </section>

        {item.lore ? (
          <section className="mt-2 rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
            <div className="mb-1 text-[10px] font-semibold tracking-wide text-zinc-400">
              📖 이야기
            </div>
            <p className="whitespace-pre-line text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              {item.lore}
            </p>
          </section>
        ) : null}

        {equippedInSlot && eqCp != null ? (
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-dashed border-zinc-300 p-2 text-[11px] dark:border-zinc-700">
            <div>
              <div className="text-[10px] text-zinc-500">현재 장착</div>
              <div className="font-mono tabular-nums">⚔️ {formatCompactKR(eqCp)}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500">이 장비</div>
              <div className="font-mono tabular-nums">
                ⚔️ {formatCompactKR(cp)}
                <span className={cp - eqCp >= 0 ? 'ml-1 text-emerald-600' : 'ml-1 text-red-600'}>
                  ({cp - eqCp >= 0 ? '+' : ''}
                  {formatCompactKR(cp - eqCp)})
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-2 rounded bg-red-50 px-2 py-1 text-[10px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {/* ── 초월 ── */}
        <section className="mt-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2 dark:border-amber-900/60 dark:bg-amber-950/20">
          <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
            초월 ✦ {item.transcendLevel} / {MAX_TRANSCEND}
          </div>
          {atMax ? (
            <div className="mt-1 text-[11px] font-bold text-amber-700">MAX 도달</div>
          ) : (
            <>
              <div className="mt-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
                T{nextT} 제물: 같은 아이템 ×{fodderNeed} (보유 {fodderOwned})
              </div>
              <button
                type="button"
                disabled={pending || !canTranscend}
                onClick={() => {
                  if (!confirmT) {
                    setConfirmT(true);
                    setTimeout(() => setConfirmT(false), 3000);
                    return;
                  }
                  setConfirmT(false);
                  // §10 자랑 — 첫 초월(T1) / 초월 MAX 달성 시 공유 모달, 그 외엔 닫기.
                  run(() => transcendAction(item.id), () => {
                    if (nextT === 1 || nextT === MAX_TRANSCEND) setBoast(true);
                    else onClose();
                  });
                }}
                className={`mt-1.5 w-full rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-40 ${
                  confirmT ? 'animate-pulse bg-red-500 text-white' : 'bg-amber-500 text-amber-950'
                }`}
              >
                {confirmT ? '다시 탭 — 확정' : `초월하기 (제물 ${fodderNeed})`}
              </button>
            </>
          )}
        </section>

        <div className="mt-2 space-y-1">
          {!item.busy ? (
            <button
              type="button"
              disabled={pending || item.isLocked}
              onClick={() =>
                run(() => startEnhance(item.id), () => {
                  onClose();
                  router.push('/enhance');
                })
              }
              className="w-full rounded-full bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-950"
            >
              {item.isLocked
                ? '🔒 잠금 해제 후 강화'
                : `⚒️ +${item.enhanceLevel} → +${item.enhanceLevel + 1} 강화${needsFodderEnhance ? ' (제물 1)' : ''}`}
            </button>
          ) : (
            <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-2 text-center text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              강화 진행 중 — 강화소에서 관리
            </div>
          )}

          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => (item.equipped ? unequipAction(item.id) : equipAction(item.id)))
              }
              className="flex-1 rounded-full border border-zinc-300 px-3 py-1.5 text-xs disabled:opacity-40 dark:border-zinc-700"
            >
              {item.equipped ? '해제' : '장착'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => toggleLockAction(item.id))}
              className="flex-1 rounded-full border border-zinc-300 px-3 py-1.5 text-xs disabled:opacity-40 dark:border-zinc-700"
            >
              {item.isLocked ? '잠금 해제' : '잠금'}
            </button>
          </div>

          <button
            type="button"
            disabled={pending || !canDisenchant}
            onClick={() => {
              if (!confirmD) {
                setConfirmD(true);
                setTimeout(() => setConfirmD(false), 3000);
                return;
              }
              setConfirmD(false);
              run(() => disenchantAction(item.id), onClose);
            }}
            className={`w-full rounded-full border px-3 py-1.5 text-xs disabled:opacity-40 ${
              confirmD
                ? 'animate-pulse border-red-500 bg-red-500 text-white'
                : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
            }`}
          >
            {!canDisenchant
              ? '♻️ 분해 불가 (장착/잠금/강화중)'
              : confirmD
                ? `♻️ 분해 확정 — 💎 ${DIAMOND_PER_DISENCHANT}`
                : `♻️ 분해 — 💎 ${DIAMOND_PER_DISENCHANT}`}
          </button>

          <button
            type="button"
            onClick={() => setBoast(true)}
            className="w-full rounded-full border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 dark:border-amber-800 dark:text-amber-300"
          >
            🔗 이 장비 자랑하기
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-1.5 text-[11px] text-zinc-500"
          >
            닫기
          </button>
        </div>
      </div>

      <BoastModal
        open={boast}
        onClose={() => setBoast(false)}
        nickname={nickname}
        kind="piece"
        headline={
          item.transcendLevel >= MAX_TRANSCEND
            ? '✦ 초월 MAX 달성!'
            : item.transcendLevel > 0
              ? `✦ 초월 T${item.transcendLevel}`
              : `✨ +${item.enhanceLevel} 장비`
        }
        piece={{
          p: {
            slot: item.slot,
            code: item.code,
            name: item.name,
            enhanceLevel: item.enhanceLevel,
            transcendLevel: item.transcendLevel,
            isChampion: item.isChampion,
          },
          cp,
        }}
      />
    </div>
  );
}
