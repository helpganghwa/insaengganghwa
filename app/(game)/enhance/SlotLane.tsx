'use client';

import { useOptimistic } from 'react';

import type { Slot } from '@/lib/db/schema/equipment';
import {
  baseSuccessRateBp,
  enhanceDurationMs,
} from '@/lib/game/balance';

import { EnhanceSlotCard, type ActiveJob } from './EnhanceSlotCard';
import { EmptySlotButton, type EnhanceCandidate } from './EnhanceSlotPicker';

/**
 * 강화 슬롯 lane 1개의 client wrapper.
 * 강화 등록(EnhanceSlotPicker.pick) 시 useOptimistic으로 즉시 가짜 ActiveJob을
 * 만들어 EnhanceSlotCard로 렌더 → 사용자가 server 응답 + router.refresh()를
 * 기다리지 않고 카드를 즉시 본다.
 * 서버 응답 후 prop initialActive가 새 값으로 도착하면 자동 fallback.
 */
export function SlotLane({
  initialActive,
  candidates,
  slot,
  diamond,
  nickname,
}: {
  initialActive: ActiveJob | null;
  candidates: EnhanceCandidate[];
  slot: Slot;
  diamond: string;
  nickname: string;
}) {
  const [optimisticActive, setOptimisticActive] = useOptimistic(initialActive);

  function startOptimistic(c: EnhanceCandidate) {
    // 가짜 ActiveJob — 서버 응답 대신 클라이언트가 BALANCE 식으로 추정.
    // baseRateBp/duration은 결정론적(level 함수)이라 정확값. jobId만 'optimistic'.
    const now = Date.now();
    const fromLevel = c.enhanceLevel;
    const duration = enhanceDurationMs(fromLevel);
    const fake: ActiveJob = {
      jobId: `optimistic-${c.id}`,
      code: c.code,
      name: c.name,
      slot: c.slot,
      fromLevel,
      targetLevel: fromLevel + 1,
      transcendLevel: c.transcendLevel,
      championRank: c.championRank,
      baseRateBp: baseSuccessRateBp(fromLevel),
      startedAtIso: new Date(now).toISOString(),
      completeAtIso: new Date(now + duration).toISOString(),
    };
    setOptimisticActive(fake);
  }

  return optimisticActive ? (
    <EnhanceSlotCard
      activeJob={optimisticActive}
      diamond={diamond}
      nickname={nickname}
    />
  ) : (
    <EmptySlotButton
      slot={slot}
      candidates={candidates}
      onOptimisticStart={startOptimistic}
    />
  );
}
