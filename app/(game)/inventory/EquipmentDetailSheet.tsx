'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { Slot } from '@/lib/db/schema/equipment';
import {
  pieceCombatPower,
  transcendFodderForStep,
  DIAMOND_PER_DISENCHANT,
} from '@/lib/game/balance';

import type { InvItem } from './InventoryGrid';
import {
  equipAction,
  unequipAction,
  toggleLockAction,
  transcendAction,
  disenchantAction,
} from './actions';
import { startEnhance } from '@/app/(game)/enhance/actions';
import { SwapPickerModal } from './SwapPickerModal';
import { useResourceToast } from '@/components/ResourceToast';
import type { MyRanks } from '@/lib/game/leaderboard/queries';
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder } from '@/components/RarityFrame';
import { assetUrl } from '@/lib/asset-versions';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

// 공통 버튼 — 3×2 그리드. Pixellab 배경 이미지 + 그라데이션 overlay + 라벨 간략.
const BTN =
  'relative flex h-16 flex-col items-center justify-end overflow-hidden rounded-lg border border-zinc-800 px-1 pb-1.5 text-white disabled:opacity-40 transition-transform active:scale-[0.97]';
const BTN_CONFIRM =
  `${BTN} animate-pulse border-2 border-red-400 ring-2 ring-red-500/60`;

function BtnBg({ src, label, sub }: { src: string; label: string; sub?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/15" />
      <span
        className="relative text-[13px] font-bold tracking-wide"
        style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.9)' }}
      >
        {label}
      </span>
      {sub ? (
        <span
          className="relative mt-0 text-[9px] font-semibold text-white/90"
          style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.9)' }}
        >
          {sub}
        </span>
      ) : null}
    </>
  );
}

export function EquipmentDetailSheet({
  item,
  all,
  nickname,
  onClose,
  onOptimisticDisenchant,
  onOptimisticToggleLock,
  onOptimisticStartEnhance,
  onOptimisticTranscend,
}: {
  item: InvItem;
  all: InvItem[];
  nickname: string;
  onClose: () => void;
  /** 단일 분해 직후 InventoryGrid에 즉시 반영용(인스턴스 제거 + 다이아 +10). */
  onOptimisticDisenchant?: (id: string) => void;
  /** 잠금 토글 직후 InventoryGrid에 즉시 반영용. */
  onOptimisticToggleLock?: (id: string) => void;
  /** 강화 시작 직후 인스턴스 busy=true 낙관 반영(페이지 이동 직전). */
  onOptimisticStartEnhance?: (id: string) => void;
  /** 단일 초월 직후 target 갱신 + fodder 제거 낙관 반영. */
  onOptimisticTranscend?: (
    targetId: string,
    toT: number,
    consumedFodderIds: string[],
  ) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmT, setConfirmT] = useState(false);
  const [confirmD, setConfirmD] = useState(false);
  const [swapPicker, setSwapPicker] = useState(false);

  const cp = pieceCombatPower(item.enhanceLevel, item.transcendLevel);
  const equippedInSlot = !item.equipped
    ? (all.find((i) => i.slot === item.slot && i.equipped) ?? null)
    : null;
  const eqCp = equippedInSlot
    ? pieceCombatPower(equippedInSlot.enhanceLevel, equippedInSlot.transcendLevel)
    : null;

  // 무한 초월 (사용자 결정 2026-05-21) — atMax 가드 제거. 제물 수는 T10 이상 10 고정.
  const nextT = item.transcendLevel + 1;
  const fodderNeed = transcendFodderForStep(nextT);
  const fodderOwned = all.filter(
    (i) =>
      i.catalogItemId === item.catalogItemId &&
      i.id !== item.id &&
      !i.equipped &&
      !i.isLocked &&
      !i.busy,
  ).length;
  // 같은 카탈로그에 더 강한 인스턴스가 있으면 약한 쪽 초월을 차단(2026-05-31 결정).
  // 안내는 상시 노출이 아닌 사용자가 초월 시도 시점에만 표시(2026-05-31 변경).
  const strongerInstance = all.find(
    (i) =>
      i.catalogItemId === item.catalogItemId &&
      i.id !== item.id &&
      (i.transcendLevel > item.transcendLevel ||
        (i.transcendLevel === item.transcendLevel && i.enhanceLevel > item.enhanceLevel)),
  );
  const canTranscend = fodderOwned >= fodderNeed;
  const canDisenchant = !item.equipped && !item.isLocked && !item.busy;
  const canEnhance = !item.busy && !item.isLocked;

  const { showRanking } = useResourceToast();
  type ActionResult = {
    status: string;
    message?: string;
    ranksBefore?: MyRanks;
    ranksAfter?: MyRanks;
  };
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (r.status === 'error') setError(r.message ?? '오류');
      else {
        if (r.ranksBefore && r.ranksAfter) showRanking(r.ranksBefore, r.ranksAfter);
        after?.();
        router.refresh();
      }
    });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="장비 상세"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-xs overflow-y-auto rounded-2xl bg-white p-3 shadow-[0_0_40px_rgba(245,158,11,0.18)] ring-1 ring-amber-700/40 dark:bg-zinc-950"
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
                {item.transcendLevel > 0 ? (
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    · ✦ {item.transcendLevel}
                  </span>
                ) : null}
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
              <div className="mt-0.5 break-keep text-sm font-semibold leading-tight">
                {item.name} <span className="text-zinc-400">+{item.enhanceLevel}</span>
              </div>
            </div>
            <div className="text-[11px] tabular-nums">
              <span className="text-zinc-500">전투력 </span>
              <span className="font-semibold">{cp.toLocaleString('ko-KR')}</span>
              {eqCp != null ? (
                <span className={`ml-1.5 ${cp - eqCp >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ({cp - eqCp >= 0 ? '+' : ''}
                  {(cp - eqCp).toLocaleString('ko-KR')} vs 장착)
                </span>
              ) : null}
            </div>
          </div>
        </section>

        {error ? (
          <p className="mt-2 rounded bg-red-50 px-2 py-1 text-[10px] leading-snug text-red-700 dark:bg-red-950/60 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {/* ── 3×2 액션 버튼 (Pixellab 배경 + 간략 라벨) ── */}
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {/* 강화 — SLOT_BUSY 시 SwapPickerModal 열어 교체. */}
          <button
            type="button"
            disabled={pending || !canEnhance}
            onClick={() => {
              if (pending || !canEnhance) return;
              setError(null);
              startTransition(async () => {
                const r = await startEnhance(item.id);
                if (r.status === 'error') {
                  if (r.code === 'SLOT_BUSY') {
                    setSwapPicker(true);
                    return;
                  }
                  setError(r.message);
                  return;
                }
                // 성공 — 낙관 busy 반영 후 강화 페이지로 이동.
                onOptimisticStartEnhance?.(item.id);
                onClose();
                router.push('/enhance');
              });
            }}
            className={BTN}
          >
            <BtnBg src={assetUrl('/sprites/ui/btn-enhance.png')} label="강화" />
          </button>
          {/* 초월 — 시도 시점에 strongerInstance 검사하여 안내(상시 노출 X). */}
          <button
            type="button"
            disabled={pending || !canTranscend}
            onClick={() => {
              if (strongerInstance) {
                setError(
                  `더 강한 같은 아이템(T${strongerInstance.transcendLevel} · +${strongerInstance.enhanceLevel})이 있어 이 아이템은 초월할 수 없어요.`,
                );
                return;
              }
              if (!confirmT) {
                setConfirmT(true);
                setTimeout(() => setConfirmT(false), 3000);
                return;
              }
              setConfirmT(false);
              // performTranscend가 약한 순으로 fodder를 잡으므로 클라도 동일 정렬로
              // 시뮬레이션 → 어떤 인스턴스가 사라질지 알아내 낙관 갱신.
              const consumedFodder = [...all]
                .filter(
                  (i) =>
                    i.catalogItemId === item.catalogItemId &&
                    i.id !== item.id &&
                    !i.isLocked &&
                    !i.equipped &&
                    !i.busy,
                )
                .sort(
                  (a, b) =>
                    a.transcendLevel - b.transcendLevel ||
                    a.enhanceLevel - b.enhanceLevel ||
                    a.id.localeCompare(b.id),
                )
                .slice(0, fodderNeed)
                .map((i) => i.id);
              run(
                () => transcendAction(item.id),
                () => {
                  onOptimisticTranscend?.(item.id, nextT, consumedFodder);
                  onClose();
                },
              );
            }}
            className={confirmT ? BTN_CONFIRM : BTN}
          >
            <BtnBg
              src={assetUrl("/sprites/ui/btn-transcend.png")}
              label={confirmT ? '확정?' : '초월'}
              sub={`T${nextT} · ${fodderOwned}/${fodderNeed}`}
            />
          </button>
          {/* 장착/해제 */}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => (item.equipped ? unequipAction(item.id) : equipAction(item.id)))
            }
            className={BTN}
          >
            <BtnBg src={assetUrl("/sprites/ui/btn-equip.png")} label={item.equipped ? '해제' : '장착'} />
          </button>
          {/* 잠금 토글 — 낙관 즉시 반영. */}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => toggleLockAction(item.id),
                () => onOptimisticToggleLock?.(item.id),
              )
            }
            className={BTN}
          >
            <BtnBg src={assetUrl("/sprites/ui/btn-lock.png")} label={item.isLocked ? '해제' : '잠금'} />
          </button>
          {/* 분해 — 낙관: 인스턴스 즉시 제거 + 다이아 +10. */}
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
              run(
                () => disenchantAction(item.id),
                () => {
                  onOptimisticDisenchant?.(item.id);
                  onClose();
                },
              );
            }}
            className={confirmD ? BTN_CONFIRM : BTN}
          >
            <BtnBg
              src={assetUrl("/sprites/ui/btn-disenchant.png")}
              label={confirmD ? '확정?' : '분해'}
              sub={canDisenchant ? `💎${DIAMOND_PER_DISENCHANT}` : undefined}
            />
          </button>
        </div>

        {/* ── 로어(스토리) — 전체 노출. 시트는 max-h-[92dvh] overflow-y-auto로 스크롤 ── */}
        {item.lore ? (
          <p className="mt-2.5 whitespace-pre-line rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
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

      {swapPicker ? (
        <SwapPickerModal
          newEquipmentInstanceId={item.id}
          slot={item.slot}
          onClose={() => setSwapPicker(false)}
        />
      ) : null}
    </div>
  );
}
