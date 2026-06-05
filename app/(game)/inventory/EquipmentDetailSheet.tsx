'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { Slot } from '@/lib/db/schema/equipment';
import { pieceCombatPower } from '@/lib/game/balance';

import type { InvItem } from './InventoryGrid';
import { equipAction, unequipAction } from './actions';
import { startEnhance } from '@/app/(game)/enhance/actions';
import { SwapPickerModal } from './SwapPickerModal';
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder } from '@/components/RarityFrame';
import { transcendStyle } from '@/lib/game/equipment/transcend';
import { assetUrl } from '@/lib/asset-versions';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

// 공통 버튼 — Pixellab 배경 이미지 + 그라데이션 overlay + 라벨 간략.
const BTN =
  'relative flex h-16 flex-col items-center justify-end overflow-hidden rounded-lg border border-zinc-800 px-1 pb-1.5 text-white disabled:opacity-40 transition-transform active:scale-[0.97]';

function BtnBg({ src, label }: { src: string; label: string }) {
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
    </>
  );
}

export function EquipmentDetailSheet({
  item,
  nickname: _nickname,
  onClose,
  onOptimisticStartEnhance,
  onOptimisticEquip,
}: {
  item: InvItem;
  all?: InvItem[];
  nickname: string;
  onClose: () => void;
  /** 강화 시작 직후 busy=true 낙관 반영(페이지 이동 직전). */
  onOptimisticStartEnhance?: (id: string) => void;
  /** 장착/해제 즉시 반영 — equipped 토글(장착 시 같은 슬롯 기존 장착 해제). */
  onOptimisticEquip?: (id: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [swapPicker, setSwapPicker] = useState(false);

  // 착용은 외형 전용 — 전투력은 착용 무관(BALANCE §3.2)이라 아이템 자체 전투력만 표시.
  const cp = pieceCombatPower(item.enhanceLevel, item.transcendLevel);
  const canEnhance = !item.busy;
  // 초월 등급 색 — 현재/다음 단계.
  const [tr, tg, tb] = transcendStyle(item.transcendLevel).colorRgb;
  const tColor = `rgb(${tr},${tg},${tb})`;
  const [nr, ng, nb] = transcendStyle(item.transcendLevel + 1).colorRgb;
  const tNextColor = `rgb(${nr},${ng},${nb})`;

  // 장착/해제는 외형 전용(랭킹 불변) — 낙관 즉시 반영 후 refresh.
  const run = (fn: () => Promise<{ status: string; message?: string }>, optimistic?: () => void) =>
    startTransition(async () => {
      setError(null);
      optimistic?.();
      const r = await fn();
      if (r.status === 'error') setError(r.message ?? '오류');
      router.refresh();
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
        {/* ── 상단: sprite + 정보(이름/슬롯/상태/전투력) ── */}
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
              championRank={item.championRank}
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
                {item.busy ? (
                  <span className="text-amber-600 dark:text-amber-400">· 강화중</span>
                ) : null}
              </div>
              <div className="mt-0.5 break-keep text-sm font-semibold leading-tight">
                {item.name}
              </div>
              {/* 이름 아래줄 — 강화수치 + 초월수치 함께 표기. */}
              <div className="mt-0.5 flex items-center gap-1.5 text-[12px] font-bold tabular-nums">
                <span className="text-amber-600 dark:text-amber-400">+{item.enhanceLevel}</span>
                {item.transcendLevel > 0 ? (
                  <span style={{ color: tColor }}>✦{item.transcendLevel}</span>
                ) : null}
              </div>
            </div>
            <div className="text-[11px] tabular-nums">
              <span className="text-zinc-500">전투력 </span>
              <span className="font-semibold">{cp.toLocaleString('ko-KR')}</span>
            </div>
          </div>
        </section>

        {/* 초월 진행 — 게이지·등급 표기를 현재 초월 등급 색상톤으로. */}
        <section
          className="mt-2.5 rounded-lg border px-2.5 py-2"
          style={{ borderColor: `rgba(${tr},${tg},${tb},0.4)`, backgroundColor: `rgba(${tr},${tg},${tb},0.08)` }}
        >
          <div className="mb-1 flex items-baseline justify-between text-[10px]">
            <span className="font-semibold">
              초월 <span style={{ color: tColor }}>✦{item.transcendLevel}</span>{' '}
              <span style={{ color: tNextColor }}>→ ✦{item.transcendLevel + 1}</span>
            </span>
            <span className="tabular-nums text-zinc-500">
              {item.transcendProgress}/{item.transcendLevel + 1} · 다음까지{' '}
              {item.transcendLevel + 1 - item.transcendProgress}개
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (item.transcendProgress / (item.transcendLevel + 1)) * 100)}%`,
                backgroundColor: tColor,
              }}
            />
          </div>
        </section>

        {error ? (
          <p className="mt-2 rounded bg-red-50 px-2 py-1 text-[10px] leading-snug text-red-700 dark:bg-red-950/60 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {/* ── 액션: 강화 / 장착 (초월은 자동, 분해·잠금 폐기) ── */}
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          {/* 강화 — SLOT_BUSY 시 SwapPickerModal 열어 교체. */}
          <button
            type="button"
            disabled={!canEnhance}
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
                onOptimisticStartEnhance?.(item.id);
                onClose();
                router.push('/enhance');
              });
            }}
            className={BTN}
          >
            <BtnBg src={assetUrl('/sprites/ui/btn-enhance.png')} label="강화" />
          </button>
          {/* 장착/해제 */}
          <button
            type="button"
            onClick={() =>
              run(
                () => (item.equipped ? unequipAction(item.id) : equipAction(item.id)),
                () => onOptimisticEquip?.(item.id),
              )
            }
            className={BTN}
          >
            <BtnBg src={assetUrl('/sprites/ui/btn-equip.png')} label={item.equipped ? '해제' : '장착'} />
          </button>
        </div>

        {/* ── 로어(스토리) ── */}
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
          newUserEquipmentId={item.id}
          slot={item.slot}
          onClose={() => setSwapPicker(false)}
        />
      ) : null}
    </div>
  );
}
