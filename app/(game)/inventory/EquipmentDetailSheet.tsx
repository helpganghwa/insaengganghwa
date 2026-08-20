'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { Slot } from '@/lib/db/schema/equipment';
import { pieceCombatPower } from '@/lib/game/balance';

import type { InvItem } from './InventoryGrid';
import { equipAction, unequipAction } from './actions';
import { startEnhance } from '@/app/(game)/enhance/actions';
import { SwapPickerModal } from './SwapPickerModal';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout } from '@/components/ModalLayout';
import { TranscendSprite } from '@/components/TranscendSprite';
import { RarityFrame, rarityBorderStyle, hasRarityBorder } from '@/components/RarityFrame';
import { transcendStyle } from '@/lib/game/equipment/transcend';
import { assetUrl } from '@/lib/asset-versions';
import { advanceTutorial } from '@/components/tutorial/events';

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

// 공통 버튼 — Pixellab 배경 이미지 + 그라데이션 overlay + 라벨 중앙.
const BTN =
  'relative flex h-12 flex-col items-center justify-center isolate overflow-hidden rounded-lg border border-zinc-800 px-1 text-white disabled:opacity-40 transition-transform active:scale-[0.97]';

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
  lore = null,
  nickname: _nickname,
  onClose,
  onOptimisticStartEnhance,
  onOptimisticEquip,
}: {
  item: InvItem;
  /** 로어 전문 — 열람 시 lazy 조회분(감사 C). 부모가 패칭 완료 후 시트를 연다. */
  lore?: string | null;
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

  // 장착/해제는 외형 전용(랭킹 불변) — 낙관 즉시 반영. 성공은 equip/unequipAction의
  // revalidatePath('/inventory')가 items prop을 갱신해 useOptimistic이 그 값으로 복귀(§11.7,
  // router.refresh 불필요). 에러만 refresh로 낙관을 서버 실제 상태로 롤백(액션이 revalidate 못 함).
  const run = (fn: () => Promise<{ status: string; message?: string }>, optimistic?: () => void) =>
    startTransition(async () => {
      setError(null);
      optimistic?.();
      const r = await fn();
      if (r.status === 'error') {
        setError(r.message ?? '오류');
        router.refresh();
      }
    });

  return (
    <>
    <ModalShell onClose={onClose} label="장비 상세">
      <ModalLayout
        title={item.name}
        subtitle={
          <>
            <span className="font-bold text-amber-600 dark:text-amber-400">+{item.enhanceLevel}</span>
            {item.transcendLevel > 0 ? (
              <>
                <span className="mx-1 text-zinc-400">·</span>
                <span className="font-bold" style={{ color: tColor }}>
                  ✦{item.transcendLevel}
                </span>
              </>
            ) : null}
            <span className="mx-1 text-zinc-400">·</span>
            <span className="font-bold text-zinc-600 dark:text-zinc-300">
              {SLOT_LABEL[item.slot]}
              {item.equipped ? ' · 장착 중' : ''}
            </span>
            <span className="mx-1 text-zinc-400">·</span>
            <span className="text-zinc-500">전투력 </span>
            <span className="font-bold tabular-nums text-zinc-600 dark:text-zinc-300">
              {cp.toLocaleString('ko-KR')}
            </span>
            {item.busy ? (
              <>
                <span className="mx-1 text-zinc-400">·</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">강화 진행 중</span>
              </>
            ) : null}
          </>
        }
        maxBodyClass="max-h-[62vh]"
        footer={
          // 스프라이트 버튼은 그대로 유지 — 텍스트 버튼으로 바꾸면 게임 톤이 깨진다.
          <div className="flex w-full flex-col gap-2">
            <div className="grid grid-cols-2 gap-1.5">
          {/* 강화 — SLOT_BUSY 시 SwapPickerModal 열어 교체. */}
          <button
            type="button"
            data-tut="enhance-btn"
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
                advanceTutorial();
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
            data-tut={item.equipped ? undefined : 'equip-btn'}
            onClick={() => {
              const equipping = !item.equipped;
              run(
                () => (equipping ? equipAction(item.id) : unequipAction(item.id)),
                () => onOptimisticEquip?.(item.id),
              );
              // 장착 직후 시트 닫기 — 인벤토리로 복귀해 다음 흐름(강화) 자연 진행.
              if (equipping) {
                advanceTutorial();
                onClose();
              }
            }}
            className={BTN}
          >
            <BtnBg src={assetUrl('/sprites/ui/btn-equip.png')} label={item.equipped ? '해제' : '장착'} />
          </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-zinc-300 py-2.5 text-[13px] font-bold text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
            >
              닫기
            </button>
          </div>
        }
      >
        {/* 수치는 제목·부제가 담당 — 컨텐츠는 장비 자체를 크게 보여준다. */}
        <section className="flex justify-center">
          <span
            className={`relative flex h-[76px] w-[76px] items-center justify-center isolate overflow-hidden rounded-xl border-2 ${
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
        </section>

        {/* 초월 진행 — 게이지·등급 표기를 현재 초월 등급 색상톤으로. */}
        <section
          className="mt-3 rounded-lg border px-2.5 py-2"
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
          <div className="h-1.5 w-full isolate overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (item.transcendProgress / (item.transcendLevel + 1)) * 100)}%`,
                backgroundColor: tColor,
              }}
            />
          </div>
        </section>

        {/* ── 로어(스토리) ── */}
        {lore ? (
          <p className="mt-2.5 whitespace-pre-line rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            {lore}
          </p>
        ) : null}

        {error ? (
          <p className="mt-2.5 rounded bg-red-50 px-2 py-1 text-[10px] leading-snug text-red-700 dark:bg-red-950/60 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {/* ── 액션: 강화 / 장착 (이야기 아래, 초월은 자동, 분해·잠금 폐기) ── */}

      </ModalLayout>
    </ModalShell>

      {swapPicker ? (
        <SwapPickerModal
          newUserEquipmentId={item.id}
          slot={item.slot}
          onClose={() => setSwapPicker(false)}
        />
      ) : null}
    </>
  );
}
