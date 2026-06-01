'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { TranscendSprite } from '@/components/TranscendSprite';
import { useDiamond } from '@/components/DiamondContext';
import * as haptic from '@/lib/game/haptic';
import { formatCompactKR } from '@/lib/ui/format-number';
import type { Slot } from '@/lib/db/schema/equipment';

import { submitProfileJob } from './actions';

type EquippedSlot = {
  slot: Slot;
  code: string | null;
  name: string | null;
  transcendLevel: number;
};

type ActiveJob = { status: string; createdAt: string | null } | null;

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
const SLOT_EMOJI: Record<Slot, string> = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };
const STATUS_LABEL: Record<string, string> = {
  queued: '대기 중',
  downloading: '생성 중',
  ai_reviewing: '검토 중',
};
const GENDERS: { value: 'female' | 'male'; label: string }[] = [
  { value: 'female', label: '여성' },
  { value: 'male', label: '남성' },
];

export function CreateProfileForm({
  diamond,
  price,
  equipped,
  activeJob,
}: {
  diamond: string;
  price: number;
  equipped: EquippedSlot[];
  activeJob: ActiveJob;
}) {
  const router = useRouter();
  const { optimisticAdjust: adjustDiamond } = useDiamond();
  const [gender, setGender] = useState<'female' | 'male'>('female');
  const [confirm, setConfirm] = useState(false);
  const [submitted, setSubmitted] = useState(false); // 낙관: 제출 직후 ⏳ 즉시 표시
  const [pending, startTransition] = useTransition();

  const balance = BigInt(diamond);
  const allEquipped = equipped.every((e) => e.code);
  const enough = balance >= BigInt(price);
  const inProgress = activeJob !== null;
  const disabled = pending || inProgress || !allEquipped || !enough;

  const onClick = () => {
    if (disabled) return;
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setConfirm(false);
    // 낙관 업데이트: 헤더 다이아 즉시 차감 + ⏳ 처리중 카드 즉시 노출. 실패 시 롤백.
    haptic.success();
    adjustDiamond(-BigInt(price));
    setSubmitted(true);
    startTransition(async () => {
      const r = await submitProfileJob(gender);
      if (r.status === 'error') {
        adjustDiamond(BigInt(price));
        setSubmitted(false);
        alert(r.message);
        return;
      }
      router.refresh();
    });
  };

  if (inProgress || submitted) {
    const statusText = activeJob ? (STATUS_LABEL[activeJob.status] ?? '처리 중') : '요청 중';
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-center dark:border-amber-700/50 dark:bg-amber-950/30">
        <div className="text-2xl">⏳</div>
        <div className="mt-1 text-sm font-semibold">아바타 {statusText}</div>
        <p className="mt-1 text-xs text-zinc-500">
          보통 몇 분 정도 걸려요. 완료되면 알림과 우편함으로 알려드릴게요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 성별 선택 */}
      <section>
        <div className="mb-2 text-xs font-medium text-zinc-500">성별</div>
        <div className="grid grid-cols-2 gap-2">
          {GENDERS.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => setGender(g.value)}
              className={`rounded-xl border-2 py-3 text-sm font-medium transition-colors ${
                gender === g.value
                  ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
                  : 'border-zinc-200 text-zinc-500 dark:border-zinc-800'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </section>

      {/* 장착 장비 (편집 불가, 모티프 소스) */}
      <section className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="mb-2 text-xs font-medium text-zinc-500">반영될 장비 (현재 장착)</div>
        <div className="grid grid-cols-3 gap-2">
          {equipped.map((it) =>
            it.code ? (
              <div
                key={it.slot}
                className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border border-zinc-200 bg-white px-1 text-center dark:border-zinc-800 dark:bg-zinc-950"
              >
                <TranscendSprite
                  code={it.code}
                  slot={it.slot}
                  level={it.transcendLevel}
                  size={48}
                  frameless
                  animate={false}
                />
                <span className="line-clamp-2 break-keep px-0.5 text-[10px] leading-tight text-zinc-600 dark:text-zinc-400">
                  {it.name}
                </span>
              </div>
            ) : (
              <a
                key={it.slot}
                href={`/inventory?slot=${it.slot}`}
                className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-zinc-300 px-1 text-center text-zinc-400 dark:border-zinc-700"
              >
                <span className="text-2xl" aria-hidden>
                  {SLOT_EMOJI[it.slot]}
                </span>
                <span className="text-[10px]">{SLOT_LABEL[it.slot]}</span>
                <span className="text-[9px] underline">장착</span>
              </a>
            ),
          )}
        </div>
        {!allEquipped && (
          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
            3종을 모두 장착해야 생성할 수 있어요.
          </p>
        )}
      </section>

      {/* 가격·잔액 */}
      <div className="flex items-center justify-between rounded-xl bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900">
        <span className="text-zinc-500">생성 비용</span>
        <span className="font-mono font-semibold tabular-nums">💎 {price.toLocaleString('ko-KR')}</span>
      </div>
      <div className="flex items-center justify-between px-1 text-xs text-zinc-500">
        <span>보유 다이아</span>
        <span className={`font-mono tabular-nums ${enough ? '' : 'text-red-500'}`}>
          💎 {formatCompactKR(balance)}
        </span>
      </div>

      {/* 생성 버튼 */}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`w-full rounded-xl py-3.5 text-sm font-bold transition-colors ${
          disabled
            ? 'bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
            : confirm
              ? 'bg-violet-700 text-white'
              : 'bg-violet-600 text-white'
        }`}
      >
        {pending
          ? '요청 중…'
          : !allEquipped
            ? '장비 3종 장착 필요'
            : !enough
              ? '다이아 부족'
              : confirm
                ? `한 번 더 눌러 생성 (💎 ${price.toLocaleString('ko-KR')})`
                : '아바타 생성'}
      </button>
      {confirm && !pending && (
        <p className="text-center text-[11px] text-zinc-400">생성을 시작하면 다이아가 차감돼요.</p>
      )}
    </div>
  );
}
