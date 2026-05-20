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
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder } from '@/components/RarityFrame';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

// 공통 버튼 클래스 — 2그리드 노출 시 시각 통일. 색만 변형으로 분기.
const BTN =
  'flex h-11 items-center justify-center rounded-lg border text-[12px] font-semibold disabled:opacity-40 transition-colors';
const BTN_NEUTRAL = `${BTN} border-zinc-300 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100`;
const BTN_PRIMARY = `${BTN} border-transparent bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-950`;
const BTN_AMBER = `${BTN} border-transparent bg-amber-500 text-amber-950`;
const BTN_DANGER = `${BTN} border-red-300 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300`;
const BTN_DANGER_CONFIRM = `${BTN} animate-pulse border-transparent bg-red-500 text-white`;

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
    ? (all.find((i) => i.slot === item.slot && i.equipped) ?? null)
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
  const canEnhance = !item.busy && !item.isLocked;

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
        {/* ── 상단: sprite + 정보(이름/슬롯/상태/전투력) 한 행 ── */}
        <section className="flex items-stretch gap-3">
          <span
            className={`relative flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 ${
              hasRarityBorder(item.transcendLevel) ? '' : 'border-zinc-200 dark:border-zinc-800'
            }`}
            style={rarityBorderStyle(item.transcendLevel)}
          >
            <RarityFrame level={item.transcendLevel} />
            <TranscendSprite
              code={item.code}
              slot={item.slot}
              level={item.transcendLevel}
              isChampion={item.isChampion}
              size={64}
              frameless
            />
          </span>
          <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                <span>{SLOT_LABEL[item.slot]}</span>
                {item.equipped ? (
                  <span className="text-emerald-600 dark:text-emerald-400">· 장착</span>
                ) : null}
                {item.isLocked ? (
                  <span className="text-amber-600 dark:text-amber-400">· 잠금</span>
                ) : null}
                {item.busy ? (
                  <span className="text-amber-600 dark:text-amber-400">· 강화중</span>
                ) : null}
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold">
                {item.name} <span className="text-zinc-400">+{item.enhanceLevel}</span>
              </div>
            </div>
            <div className="text-[11px] tabular-nums">
              <span className="text-zinc-500">⚔️ </span>
              <span className="font-semibold">{formatCompactKR(cp)}</span>
              {eqCp != null ? (
                <span className={`ml-1.5 ${cp - eqCp >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ({cp - eqCp >= 0 ? '+' : ''}
                  {formatCompactKR(cp - eqCp)} vs 장착)
                </span>
              ) : null}
            </div>
          </div>
        </section>

        {/* ── 초월 정보 (한 줄, 액션은 아래 2그리드에서) ── */}
        <div className="mt-2.5 flex items-center justify-between rounded-lg bg-amber-50/60 px-2.5 py-1.5 text-[11px] dark:bg-amber-950/20">
          <span className="font-semibold text-amber-800 dark:text-amber-300">
            ✦ 초월 {item.transcendLevel}
          </span>
          <span className="text-amber-700/80 dark:text-amber-400/70">
            {atMax ? 'MAX' : `T${nextT} 제물 ${fodderOwned}/${fodderNeed}`}
          </span>
        </div>

        {error ? (
          <p className="mt-2 rounded bg-red-50 px-2 py-1 text-[10px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {/* ── 2그리드 액션 버튼들 ── */}
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          {/* 강화 (주요) */}
          <button
            type="button"
            disabled={pending || !canEnhance}
            onClick={() =>
              run(
                () => startEnhance(item.id),
                () => {
                  onClose();
                  router.push('/enhance');
                },
              )
            }
            className={BTN_PRIMARY}
          >
            ⚒️ 강화{needsFodderEnhance ? ' (제물)' : ''}
          </button>
          {/* 초월 (주요) */}
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
              run(
                () => transcendAction(item.id),
                () => {
                  if (nextT === 1 || nextT === MAX_TRANSCEND) setBoast(true);
                  else onClose();
                },
              );
            }}
            className={confirmT ? BTN_DANGER_CONFIRM : BTN_AMBER}
          >
            {confirmT ? '확정?' : `✦ 초월${atMax ? ' MAX' : ` (${fodderNeed})`}`}
          </button>
          {/* 장착/해제 */}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => (item.equipped ? unequipAction(item.id) : equipAction(item.id)))
            }
            className={BTN_NEUTRAL}
          >
            {item.equipped ? '해제' : '장착'}
          </button>
          {/* 잠금 토글 */}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => toggleLockAction(item.id))}
            className={BTN_NEUTRAL}
          >
            {item.isLocked ? '🔓 잠금 해제' : '🔒 잠금'}
          </button>
          {/* 분해 */}
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
            className={confirmD ? BTN_DANGER_CONFIRM : BTN_DANGER}
          >
            {!canDisenchant
              ? '♻️ 분해 불가'
              : confirmD
                ? `확정? 💎${DIAMOND_PER_DISENCHANT}`
                : `♻️ 분해 💎${DIAMOND_PER_DISENCHANT}`}
          </button>
          {/* 자랑 */}
          <button type="button" onClick={() => setBoast(true)} className={BTN_NEUTRAL}>
            🔗 자랑
          </button>
        </div>

        {/* ── 로어 (있으면, 폴드 안 함 — 짧게 line-clamp) ── */}
        {item.lore ? (
          <p className="mt-2.5 line-clamp-3 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            📖 {item.lore}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="mt-2.5 w-full py-1.5 text-[11px] text-zinc-500"
        >
          닫기
        </button>
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
