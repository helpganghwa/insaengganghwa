'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { TranscendSprite } from '@/components/TranscendSprite';
import { useDiamond } from '@/components/DiamondContext';
import { useResourceToast } from '@/components/ResourceToast';
import * as haptic from '@/lib/game/haptic';
import { formatCompactKR } from '@/lib/ui/format-number';
import { PROFILE_MAX } from '@/lib/game/balance';
import type { Slot } from '@/lib/db/schema/equipment';
import type { ProfileQueueInfo } from '@/lib/game/profile/queue';

import { submitProfileJob } from './actions';

type EquippedSlot = {
  slot: Slot;
  code: string | null;
  name: string | null;
  transcendLevel: number;
};

const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
const SLOT_EMOJI: Record<Slot, string> = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };
const STATUS_LABEL: Record<string, string> = {
  queued: '대기 중',
  starting: '생성 시작',
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
  profileCount,
  equipped,
  queue,
}: {
  diamond: string;
  price: number;
  profileCount: number;
  equipped: EquippedSlot[];
  queue: ProfileQueueInfo | null;
}) {
  const router = useRouter();
  const { optimisticAdjust: adjustDiamond } = useDiamond();
  const { showHeaderToast, showError } = useResourceToast();
  const [gender, setGender] = useState<'female' | 'male'>('female');
  const [confirm, setConfirm] = useState(false);
  const [confirmLeft, setConfirmLeft] = useState(0); // 3s 재탭 컨펌 카운트다운
  const [submitted, setSubmitted] = useState(false); // 낙관: 제출 직후 ⏳ 즉시 표시
  const [nowMs, setNowMs] = useState<number | null>(null); // 진행시간용 라이브 클럭(마운트 후 세팅 — 하이드레이션 안전)
  const [pending, startTransition] = useTransition();

  // 생성 — 강화 취소와 동일 3s 재탭 컨펌(오탭 보호). 만료 시 자동 해제.
  useEffect(() => {
    if (!confirm) {
      setConfirmLeft(0);
      return;
    }
    setConfirmLeft(3);
    const id = setInterval(() => {
      setConfirmLeft((s) => {
        if (s <= 1) {
          setConfirm(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [confirm]);

  // 생성 진행/대기 중이면 1초마다 라이브 클럭 갱신(경과 시간 표시용).
  useEffect(() => {
    if (queue === null && !submitted) return;
    const tick = () => setNowMs(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [queue, submitted]);

  // 진행/대기 중이면 30초마다 서버 상태 재조회(대기→시작→완료 반영). 완료되면 queue=null로 정지.
  useEffect(() => {
    if (queue === null) return;
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [queue, router]);

  const balance = BigInt(diamond);
  const allEquipped = equipped.every((e) => e.code);
  const enough = balance >= BigInt(price);
  const inProgress = queue !== null;
  const disabled = pending || inProgress || !allEquipped || !enough;

  const onClick = () => {
    if (disabled) return;
    // 요청 전 선검사 — 보유 상한 초과 시 즉시 안내(서버 왕복·confirm 없이).
    if (profileCount >= PROFILE_MAX) {
      showError(`프로필은 최대 ${PROFILE_MAX}개까지 보유할 수 있어요`);
      return;
    }
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
        showError(r.message);
        return;
      }
      showHeaderToast({ title: '아바타 생성 중', detail: '약 10분 내외 소요' });
      router.refresh();
    });
  };

  if (inProgress || submitted) {
    // 대기열(슬롯 가득 → 웨이브 대기) vs 생성 중/곧 시작 구분.
    const waiting = queue?.waiting ?? false;
    const statusText = queue ? (STATUS_LABEL[queue.status] ?? '처리 중') : '요청 중';
    const startedAt = queue?.createdAt ? Date.parse(queue.createdAt) : NaN;
    const elapsedSec =
      !Number.isNaN(startedAt) && nowMs != null ? Math.max(0, Math.floor((nowMs - startedAt) / 1000)) : null;
    const elapsedText =
      elapsedSec == null
        ? null
        : elapsedSec < 60
          ? `${elapsedSec}초`
          : `${Math.floor(elapsedSec / 60)}분 ${elapsedSec % 60}초`;
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-center dark:border-amber-700/50 dark:bg-amber-950/30">
        <div className="text-2xl">{waiting ? '🕐' : '⏳'}</div>
        <div className="mt-1 text-sm font-semibold">
          {waiting ? `아바타 생성 대기 중` : `아바타 ${statusText}`}
        </div>
        {waiting && queue ? (
          <div className="mt-1 text-sm font-semibold text-amber-700 dark:text-amber-300">
            대기 {queue.position}번째 · 예상 약 {queue.etaMinutes}분
          </div>
        ) : (
          elapsedText && (
            <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-300">
              경과 {elapsedText}
            </div>
          )
        )}
        <p className="mt-1 text-xs text-zinc-500">
          {waiting
            ? '생성 슬롯이 비면 자동으로 시작돼요. 화면을 닫아도 진행되며, 완료되면 알림과 우편함으로 알려드려요.'
            : '보통 약 10분 내외 걸려요(혼잡하면 조금 더 걸릴 수 있어요). 완료되면 알림과 우편함으로 알려드릴게요.'}
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
            장비를 모두 장착해야 생성할 수 있어요.
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
        className={`relative w-full isolate overflow-hidden rounded-xl py-3.5 text-sm font-bold transition-colors ${
          disabled
            ? 'bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
            : confirm
              ? 'bg-violet-700 text-white'
              : 'bg-violet-600 text-white'
        }`}
      >
        {/* 배경만 펄스(텍스트 안정) — 일괄 초월 확인버튼 패턴. */}
        {confirm ? (
          <span
            aria-hidden
            className="absolute inset-0 bg-violet-500"
            style={{ animation: 'confirm-bg-pulse 1.2s ease-in-out infinite' }}
          />
        ) : null}
        <span className="relative">
          {pending
            ? '요청 중…'
            : !allEquipped
              ? '장비 3종 장착 필요'
              : !enough
                ? '다이아 부족'
                : confirm
                  ? `한 번 더 누르면 💎 ${price.toLocaleString('ko-KR')} 차감 (${confirmLeft}s)`
                  : '아바타 생성'}
        </span>
      </button>
    </div>
  );
}
