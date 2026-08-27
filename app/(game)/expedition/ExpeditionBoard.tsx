'use client';

import { useCallback, useState, useTransition } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { Ticker } from '@/components/Ticker';
import { useDiamondActions } from '@/components/DiamondContext';
import { useDiamondGate } from '@/components/DiamondGate';
import {
  EXPEDITION_DAILY_STARTS,
  EXPEDITION_SYNERGY_GENERAL_BP,
  EXPEDITION_SYNERGY_MATCH_BP,
  GEM_TO_MS,
  type ExpeditionRegion, expeditionReqBonusBp } from '@/lib/game/balance';
import type { ExpeditionBoard, ExpeditionBoardSlot } from '@/lib/game/expedition/queries';
import type { ExpeditionReward } from '@/lib/game/expedition/engine';

import {
  cancelExpeditionAction,
  claimExpeditionAction,
  completeNowExpeditionAction,
  expeditionBoardAction,
  purchaseExpeditionSlotAction,
  refreshOfferAction,
  startExpeditionAction,
  type ClaimActionResult,
} from './actions';

/**
 * 파견 보드(클라) — 낙관적 UI 우선(사용자 지시 2026-08-25):
 *  - 모든 변이는 로컬 예측을 즉시 그리고, 액션 응답의 board(서버 정본)로 수렴한다(§11.7 nextJob 패턴).
 *  - 다이아 소모(유료 리롤·즉시완료·슬롯 구매)는 useDiamondGate.ensure 사전 체크 + optimisticAdjust.
 *  - 수령 팝업만은 서버 응답을 기다린다 — 대성공(10%)이 수령 시 서버 롤이라 예측 불가.
 */

/** 시간 라벨 색 — 길수록 뜨겁게(4h 초록→24h 빨강, 난이도색 계승 — 사용자 확정). */
const HOUR_CLS: Record<number, string> = {
  4: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  8: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  12: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  24: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

/** 지역 표기 — 이모지 대신 지역색(월드맵 노드 REGION_COLOR와 일치, UI 피드백 2026-08-25). */
const REGION_UI: Record<ExpeditionRegion, { color: string; label: string }> = {
  swamp: { color: '#22c55e', label: '슬라임 늪' },
  orc: { color: '#f97316', label: '오크 부락' },
  kingdom: { color: '#fbbf24', label: '왕국' },
  temple: { color: '#60a5fa', label: '잊힌 신전' },
  volcano: { color: '#ef4444', label: '드래곤 화산' },
  angel: { color: '#c084fc', label: '타락 천사 부유섬' },
};

function fmtRemain(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

function RewardLine({ r, strong }: { r: ExpeditionReward; strong?: boolean }) {
  const parts: string[] = [];
  if (r.boxes) {
    const total = r.boxes.weapon + r.boxes.armor + r.boxes.accessory;
    if (total > 0) parts.push(`상자 ${total}개`);
  }
  if (r.diamond) parts.push(`💎 ${r.diamond.toLocaleString('ko-KR')}`);
  return (
    <b className={strong ? 'text-amber-500 dark:text-amber-400' : 'text-zinc-800 dark:text-zinc-200'}>
      {parts.join(' + ')}
    </b>
  );
}

function boxDetail(r: ExpeditionReward): string {
  if (!r.boxes) return '';
  const p: string[] = [];
  if (r.boxes.weapon) p.push(`무기 ${r.boxes.weapon}`);
  if (r.boxes.armor) p.push(`방어구 ${r.boxes.armor}`);
  if (r.boxes.accessory) p.push(`장신구 ${r.boxes.accessory}`);
  return p.join(' · ');
}

/** 클라 시너지 미리보기 — 서버 판정(engine)과 동일 산식(배정 시트 표시용, 권위는 서버). */
function synergyOf(regions: (ExpeditionRegion | 'general')[], mission: ExpeditionRegion): number {
  let bp = 0;
  for (const r of regions) {
    if (r === mission) bp += EXPEDITION_SYNERGY_MATCH_BP;
    else if (r === 'general') bp += EXPEDITION_SYNERGY_GENERAL_BP;
  }
  return bp;
}

type ClaimPopup = { crit: boolean; reward: ExpeditionReward; xpGained: number; level: number; levelUp: boolean; region: ExpeditionRegion };

export function ExpeditionBoardView({ initial }: { initial: ExpeditionBoard }) {
  const [board, setBoard] = useState(initial);
  const [pendingSlot, setPendingSlot] = useState<number | null>(null);
  const [assignFor, setAssignFor] = useState<ExpeditionBoardSlot | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<number | null>(null);
  const [purchaseFor, setPurchaseFor] = useState<ExpeditionBoardSlot | null>(null);
  const [claimPopup, setClaimPopup] = useState<ClaimPopup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { optimisticAdjust } = useDiamondActions();
  const gate = useDiamondGate();

  const showError = (code: string) => {
    const msg: Record<string, string> = {
      START_LIMIT: '오늘 파견 횟수를 모두 사용했어요 (자정에 초기화)',
      AVATAR_BUSY: '이미 파견 중인 아바타예요',
      INSUFFICIENT_DIAMOND: '다이아가 부족해요',
      NOT_READY: '아직 귀환하지 않았어요',
    };
    setError(msg[code] ?? '잠시 후 다시 시도해주세요');
    setTimeout(() => setError(null), 2500);
  };

  /** 액션 공통 — 실패 시 서버 보드 재동기 + undo(다이아 낙관 선반영 역보정, 적대 검수 4). */
  const run = useCallback(
    (
      slot: number | null,
      optimistic: (b: ExpeditionBoard) => ExpeditionBoard,
      act: () => Promise<{ ok: boolean; code?: string; board?: ExpeditionBoard }>,
      undo?: () => void,
    ) => {
      setPendingSlot(slot);
      setBoard(optimistic);
      startTransition(async () => {
        const r = await act();
        if (r.ok && r.board) setBoard(r.board);
        else {
          undo?.();
          if (!r.ok && r.code) showError(r.code);
          const fresh = await expeditionBoardAction();
          if (fresh.ok) setBoard(fresh.board);
        }
        setPendingSlot(null);
      });
    },
    [],
  );

  const doRefresh = (s: ExpeditionBoardSlot) => {
    const paid = board.freeRefreshLeft <= 0;
    if (paid && !gate.ensure(board.refreshCost)) return;
    if (paid) optimisticAdjust(BigInt(-board.refreshCost));
    run(
      s.slot,
      (b) => ({
        ...b,
        freeRefreshLeft: paid ? 0 : b.freeRefreshLeft - 1,
        // 리롤 내용은 서버만 안다 — 해당 슬롯을 로딩 표시(reward 숨김)로.
        slots: b.slots.map((x) => (x.slot === s.slot ? { ...x, reward: undefined } : x)),
      }),
      () => refreshOfferAction(s.slot),
      paid ? () => optimisticAdjust(BigInt(board.refreshCost)) : undefined,
    );
  };

  const doStart = (s: ExpeditionBoardSlot, avatarId: string) => {
    const av = board.avatars.find((a) => a.id === avatarId);
    const syn = av && s.region ? synergyOf(av.regions, s.region) : 0;
    setAssignFor(null);
    setSelectedAvatar(null);
    run(
      s.slot,
      (b) => ({
        ...b,
        startsLeft: Math.max(0, b.startsLeft - 1),
        slots: b.slots.map((x) =>
          x.slot === s.slot
            ? {
                ...x,
                state: 'running',
                completeAtIso: new Date(Date.now() + (s.hours ?? 0) * 3_600_000).toISOString(),
                synergyBp: syn,
                reqBonusBp: expeditionReqBonusBp(s.requiredSum ?? 0),
                avatarId,
                avatarFace: av?.face ?? null,
              }
            : x,
        ),
        avatars: b.avatars.map((a) => (a.id === avatarId ? { ...a, busy: true } : a)),
      }),
      () => startExpeditionAction(s.slot, avatarId),
    );
  };

  const doCompleteNow = (s: ExpeditionBoardSlot) => {
    // eslint-disable-next-line react-hooks/purity -- 클릭 핸들러 실행 시점 계산(렌더 아님) — 비용은 서버가 재계산·캡
    const remain = s.completeAtIso ? Math.max(0, Date.parse(s.completeAtIso) - Date.now()) : 0;
    const cost = remain <= 0 ? 0 : Math.max(1, Math.ceil(remain / GEM_TO_MS));
    if (cost > 0 && !gate.ensure(cost)) return;
    if (cost > 0) optimisticAdjust(BigInt(-cost));
    run(
      s.slot,
      (b) => ({
        ...b,
        slots: b.slots.map((x) => (x.slot === s.slot ? { ...x, completeAtIso: new Date().toISOString() } : x)),
      }),
      () => completeNowExpeditionAction(s.slot),
      cost > 0 ? () => optimisticAdjust(BigInt(cost)) : undefined,
    );
  };

  const doCancel = (slot: number) => {
    setCancelFor(null);
    run(
      slot,
      (b) => ({
        ...b,
        slots: b.slots.map((x) => (x.slot === slot ? { slot, state: 'offer' as const, reward: undefined } : x)),
        avatars: b.avatars.map((a) => {
          const row = b.slots.find((x) => x.slot === slot);
          return row?.avatarId === a.id ? { ...a, busy: false } : a;
        }),
      }),
      () => cancelExpeditionAction(slot),
    );
  };

  const doClaim = (s: ExpeditionBoardSlot) => {
    // 다이아는 비크리 기준 낙관 선반영 — 대성공이면 크리 추가분을 응답 후 가산, 실패면 역보정
    // (적대 검수 4: 클라 시계가 빨라 NOT_READY가 나면 선반영이 표시 드리프트로 남던 문제).
    const preAdd = s.reward?.diamond ?? 0;
    if (preAdd > 0) optimisticAdjust(BigInt(preAdd));
    setPendingSlot(s.slot);
    startTransition(async () => {
      const r: ClaimActionResult = await claimExpeditionAction(s.slot);
      if (r.ok) {
        // 크리·시작가 차이 보정 — 실지급(r.reward)과 선반영(preAdd)의 차액만 추가 반영.
        const diff = (r.reward.diamond ?? 0) - preAdd;
        if (diff !== 0) optimisticAdjust(BigInt(diff));
        setBoard(r.board);
        setClaimPopup({ crit: r.crit, reward: r.reward, xpGained: r.xpGained, level: r.level, levelUp: r.levelUp, region: s.region! });
      } else {
        if (preAdd > 0) optimisticAdjust(BigInt(-preAdd));
        showError(r.code);
        const fresh = await expeditionBoardAction();
        if (fresh.ok) setBoard(fresh.board);
      }
      setPendingSlot(null);
    });
  };

  const doPurchase = (s: ExpeditionBoardSlot) => {
    setPurchaseFor(null);
    const cost = s.unlock?.diamond ?? 0;
    if (!gate.ensure(cost)) return;
    optimisticAdjust(BigInt(-cost));
    run(null, (b) => b, () => purchaseExpeditionSlotAction(s.slot), () => optimisticAdjust(BigInt(cost)));
  };

  const xpPct = Math.min(100, Math.round((board.xp / Math.max(1, board.xpNext)) * 100));

  return (
    <div className="space-y-2.5">
      {/* 레벨·카운터 */}
      <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>
            파견 <b className="text-zinc-800 dark:text-zinc-100">Lv.{board.level}</b>
            <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-bold">보상 +{board.bonusBp / 100}%</span>
          </span>
          <span>
            오늘 파견 <b className="text-amber-600 dark:text-amber-400">{EXPEDITION_DAILY_STARTS - board.startsLeft}</b>/{EXPEDITION_DAILY_STARTS}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${xpPct}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-zinc-400 dark:text-zinc-500">
          <span>다음 레벨까지 {Math.max(0, board.xpNext - board.xp)} XP</span>
          <span>
            새로고침 무료 <b className="text-zinc-600 dark:text-zinc-300">{board.freeRefreshLeft}회</b>
            {board.freeRefreshLeft === 0 ? ` (💎${board.refreshCost})` : ''}
          </span>
        </div>
      </div>

      {/* 에러 — 목록을 밀지 않는 하단 고정 토스트(레이아웃 시프트 0 규칙) */}
      {error ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-6">
          <span className="rounded-full bg-red-600/95 px-4 py-2 text-[11.5px] font-bold text-white shadow-lg">{error}</span>
        </div>
      ) : null}

      {/* 슬롯 */}
      {board.slots.map((s) => (
        <SlotCard
          key={s.slot}
          s={s}
          pending={pendingSlot === s.slot}
          onRefresh={() => doRefresh(s)}
          onAssign={() => {
            setAssignFor(s);
            setSelectedAvatar(board.avatars.find((a) => !a.busy && a.enhanceSum >= (s.requiredSum ?? 0))?.id ?? null);
          }}
          onCancel={() => setCancelFor(s.slot)}
          onCompleteNow={() => doCompleteNow(s)}
          onClaim={() => doClaim(s)}
          onPurchase={() => setPurchaseFor(s)}
        />
      ))}

      {/* 아바타 배정 시트 */}
      {assignFor?.region ? (
        <ModalShell onClose={() => setAssignFor(null)} label="원정대원 선택">
          <ModalLayout
            title={
              <span style={{ color: REGION_UI[assignFor.region].color }}>
                {REGION_UI[assignFor.region].label}
              </span>
            }
            subtitle={
              (assignFor.requiredSum ?? 0) > 0
                ? `${assignFor.hours}시간 파견 · 필요 강화 합 ${assignFor.requiredSum} (보상 ×${(1 + expeditionReqBonusBp(assignFor.requiredSum!) / 10000).toFixed(2)})`
                : `${assignFor.hours}시간 파견 — 원정대원을 고르세요`
            }
            bodyPad="sm"
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setAssignFor(null)}>
                  닫기
                </ModalButton>
                <ModalButton
                  tone="contrast"
                  disabled={!selectedAvatar || board.startsLeft <= 0}
                  onClick={() => selectedAvatar && doStart(assignFor, selectedAvatar)}
                >
                  {board.startsLeft <= 0
                    ? '오늘 횟수 소진'
                    : `파견 보내기 (오늘 ${EXPEDITION_DAILY_STARTS - board.startsLeft}/${EXPEDITION_DAILY_STARTS})`}
                </ModalButton>
              </>
            }
          >
            {/* 고정 높이 그리드(내부 스크롤) — 아바타 수와 무관하게 팝업 높이 불변(레이아웃 시프트 0). */}
            <div className="h-[184px] overflow-y-auto rounded-xl border border-zinc-100 p-1.5 dark:border-zinc-800/60">
              <div className="grid grid-cols-4 gap-2">
                {board.avatars.map((a) => {
                  const syn = synergyOf(a.regions, assignFor.region!);
                  const req = assignFor.requiredSum ?? 0;
                  const short = a.enhanceSum < req; // 필요 강화 합 미달(§3.3) — 서버도 같은 판정(REQ_NOT_MET)
                  const sel = selectedAvatar === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={a.busy || short}
                      onClick={() => setSelectedAvatar(a.id)}
                      className={`relative rounded-xl border p-1.5 text-center transition ${
                        sel
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-zinc-200 dark:border-zinc-800'
                      } ${a.busy || short ? 'opacity-40' : 'active:scale-95'}`}
                    >
                      <span className="mx-auto block h-12 w-12 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                        {a.face ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.face} alt="" decoding="async" className="h-full w-full" style={{ imageRendering: 'pixelated' }} />
                        ) : null}
                      </span>
                      <span className={`mt-1 block text-[9px] font-bold ${syn > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'}`}>
                        {a.busy ? '파견 중' : short ? `강화 합 ${a.enhanceSum}/${req}` : syn > 0 ? `시너지 +${syn / 100}%` : `강화 합 ${a.enhanceSum}`}
                      </span>
                      {a.isActive ? (
                        <span className="absolute top-1 right-1 rounded bg-zinc-800/80 px-1 text-[8px] font-bold text-white">대표</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* 미리보기 — 선택 전에도 자리 확보(고정 높이, 레이아웃 시프트 0). */}
            <p className="flex h-9 items-center justify-center px-2 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
              {selectedAvatar && assignFor.reward ? (
                <>
                  최종 보상{' '}
                  <RewardLine
                    r={previewFinal(assignFor.reward, synergyOf(board.avatars.find((a) => a.id === selectedAvatar)?.regions ?? [], assignFor.region!) + board.bonusBp + expeditionReqBonusBp(assignFor.requiredSum ?? 0))}
                    strong
                  />
                </>
              ) : (
                '원정대원을 선택하세요'
              )}
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}

      {/* 취소 확인 */}
      {cancelFor !== null ? (
        <ModalShell onClose={() => setCancelFor(null)} label="파견 취소">
          <ModalLayout
            title="파견을 취소할까요?"
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setCancelFor(null)}>
                  계속 보내기
                </ModalButton>
                <ModalButton tone="danger" onClick={() => doCancel(cancelFor)}>
                  취소하기
                </ModalButton>
              </>
            }
          >
            <p className="text-center text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              보상 없이 파견이 종료돼요.
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}

      {/* 슬롯 바로 열기 — 다이아 소모 컨펌(UI 피드백 3) */}
      {purchaseFor ? (
        <ModalShell onClose={() => setPurchaseFor(null)} label="슬롯 열기">
          <ModalLayout
            title={`슬롯 ${purchaseFor.slot} 바로 열기`}
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setPurchaseFor(null)}>
                  닫기
                </ModalButton>
                <ModalButton tone="contrast" onClick={() => doPurchase(purchaseFor)}>
                  💎 {purchaseFor.unlock?.diamond.toLocaleString('ko-KR')} 사용
                </ModalButton>
              </>
            }
          >
            <p className="text-center text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              파견 Lv.{purchaseFor.unlock?.level} 달성을 기다리지 않고 지금 바로 엽니다.
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}

      {/* 수령 팝업 — 대성공은 서버 판정이라 응답 후 표시 */}
      {claimPopup ? (
        <ModalShell onClose={() => setClaimPopup(null)} label="파견 귀환">
          <ModalLayout
            title={claimPopup.crit ? '대성공!' : '파견 귀환'}
            subtitle={
              <span style={{ color: REGION_UI[claimPopup.region].color }}>
                {REGION_UI[claimPopup.region].label}
              </span>
            }
            footer={
              <ModalButton tone="contrast" onClick={() => setClaimPopup(null)}>
                확인
              </ModalButton>
            }
          >
            {/* 보상 영역 고정 높이 — 상자/다이아/둘 다·대성공 어느 조합이든 동일(레이아웃 시프트 0). */}
            <div className="flex h-[104px] flex-col items-center justify-center gap-1 text-center">
              <p className={`text-lg font-extrabold ${claimPopup.crit ? 'text-amber-500' : ''}`}>
                <RewardLine r={claimPopup.reward} strong={claimPopup.crit} />
              </p>
              <p className="h-4 text-[11px] text-zinc-500 dark:text-zinc-400">
                {claimPopup.reward.boxes ? boxDetail(claimPopup.reward) : ''}
              </p>
              <p className="h-4 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                {claimPopup.crit ? '대성공으로 수량이 2배가 됐어요!' : ''}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                파견 XP +{claimPopup.xpGained}
                {claimPopup.levelUp ? (
                  <b className="ml-1 text-amber-600 dark:text-amber-400">— Lv.{claimPopup.level} 달성!</b>
                ) : null}
              </p>
            </div>
          </ModalLayout>
        </ModalShell>
      ) : null}

      {gate.modal}
    </div>
  );
}

/** 클라 미리보기 배율 — engine.applyMultiplier와 동일 산식(표시 전용, 권위는 서버). */
function previewFinal(r: ExpeditionReward, totalBp: number): ExpeditionReward {
  const m = 1 + totalBp / 10000;
  const s = (n: number) => Math.max(1, Math.round(n * m));
  return {
    kind: r.kind,
    ...(r.boxes ? { boxes: { weapon: r.boxes.weapon ? s(r.boxes.weapon) : 0, armor: r.boxes.armor ? s(r.boxes.armor) : 0, accessory: r.boxes.accessory ? s(r.boxes.accessory) : 0 } } : {}),
    ...(r.diamond ? { diamond: s(r.diamond) } : {}),
  };
}

function SlotCard({
  s,
  pending,
  onRefresh,
  onAssign,
  onCancel,
  onCompleteNow,
  onClaim,
  onPurchase,
}: {
  s: ExpeditionBoardSlot;
  pending: boolean;
  onRefresh: () => void;
  onAssign: () => void;
  onCancel: () => void;
  onCompleteNow: () => void;
  onClaim: () => void;
  onPurchase: () => void;
}) {
  // B안(아바타 히어로) — 전 상태 h-[112px] 고정: 좌측 히어로(지역색 그라데이션+아바타 프레임),
  // 우측 본문(제목/보상/버튼행). 상태 전환은 각 영역의 내용 교체만 — 레이아웃 시프트 0.
  if (s.state === 'locked') {
    return (
      <div className="flex h-[112px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <p className="text-[11.5px] text-zinc-400 dark:text-zinc-500">
          슬롯 {s.slot} — <b className="text-zinc-500 dark:text-zinc-400">파견 Lv.{s.unlock?.level}</b> 달성 시 무료 오픈
        </p>
        <button
          type="button"
          onClick={onPurchase}
          className="h-[30px] rounded-lg bg-zinc-100 px-4 text-[11.5px] font-bold text-zinc-600 active:scale-95 dark:bg-zinc-800 dark:text-zinc-300"
        >
          💎 {s.unlock?.diamond.toLocaleString('ko-KR')}으로 바로 열기
        </button>
      </div>
    );
  }

  const region = s.region ? REGION_UI[s.region] : null;
  const heroLabel = s.state === 'offer' ? '미배정' : null;

  return (
    <div
      className={`flex h-[112px] overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60 ${pending ? 'opacity-70' : ''}`}
    >
      {/* 히어로 — 지역색 그라데이션 + 아바타 프레임(미배정=점선 빈 프레임, 사람 이모지 없음). */}
      <div
        className="flex w-[76px] shrink-0 flex-col items-center justify-center gap-1.5"
        style={{
          background: region
            ? `linear-gradient(160deg, ${region.color}2e, transparent 70%)`
            : undefined,
        }}
      >
        <span
          className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border bg-zinc-100 dark:bg-zinc-900 ${
            s.state === 'offer' ? 'border-dashed' : ''
          }`}
          style={{ borderColor: region ? `${region.color}66` : undefined }}
        >
          {s.state !== 'offer' && s.avatarFace ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.avatarFace} alt="" decoding="async" className="h-full w-full" style={{ imageRendering: 'pixelated' }} />
          ) : null}
        </span>
        <span className="h-3 text-[8.5px] font-bold text-zinc-400 dark:text-zinc-500">{heroLabel ?? ''}</span>
      </div>

      {/* 본문 — 3영역(제목행/정보행/버튼행) 높이 고정. */}
      <div className="flex min-w-0 flex-1 flex-col px-3 py-2.5">
        <div className="flex h-5 items-center gap-1.5">
          <span className="truncate text-[13px] font-extrabold" style={region ? { color: region.color } : undefined}>
            {region?.label ?? '…'}
          </span>
          {s.hours ? (
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black ${HOUR_CLS[s.hours] ?? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>
              {s.hours}시간
            </span>
          ) : null}
          <span className="ml-auto shrink-0">
            {s.state === 'running' ? (
              <Ticker>
                {(now) => {
                  const remain = s.completeAtIso ? Date.parse(s.completeAtIso) - now : 0;
                  return remain <= 0 ? (
                    <span className="text-[12px] font-extrabold text-emerald-500">귀환 완료</span>
                  ) : (
                    <span className="text-[12px] font-extrabold tabular-nums text-amber-600 dark:text-amber-400">{fmtRemain(remain)}</span>
                  );
                }}
              </Ticker>
            ) : null}
          </span>
        </div>

        <p className="flex h-5 flex-1 items-center truncate text-[10.5px] text-zinc-500 dark:text-zinc-400">
          {s.reward ? (
            <>
              보상 <RewardLine r={s.reward} />
              <span className="ml-1.5 shrink-0">· 경험치 +{s.hours}</span>
              {s.state === 'offer' && (s.requiredSum ?? 0) > 0 ? (
                <span className="ml-1.5 shrink-0 font-bold text-sky-600 dark:text-sky-400">필요 강화 합 {s.requiredSum} · ×{(1 + (s.reqBonusBp ?? 0) / 10000).toFixed(2)}</span>
              ) : null}
              {s.state === 'running' && (s.reqBonusBp ?? 0) > 0 ? (
                <span className="ml-1.5 shrink-0 font-bold text-sky-600 dark:text-sky-400">강화 +{((s.reqBonusBp ?? 0) / 100).toFixed(0)}%</span>
              ) : null}
              {s.state === 'running' && (s.synergyBp ?? 0) > 0 ? (
                <span className="ml-1.5 shrink-0 font-bold text-amber-600 dark:text-amber-400">시너지 +{(s.synergyBp ?? 0) / 100}%</span>
              ) : null}
            </>
          ) : (
            '새 미션 찾는 중…'
          )}
        </p>

        <div className="flex h-[30px] gap-1.5">
          {s.state === 'offer' ? (
            <>
              <button
                type="button"
                onClick={onRefresh}
                disabled={pending}
                className="flex-1 rounded-lg bg-zinc-100 text-[11px] font-bold text-zinc-600 active:scale-[0.98] dark:bg-zinc-800 dark:text-zinc-300"
              >
                새로고침
              </button>
              <button
                type="button"
                onClick={onAssign}
                disabled={pending}
                className="flex-1 rounded-lg bg-amber-500 text-[11.5px] font-extrabold text-amber-950 active:scale-[0.98]"
              >
                배정
              </button>
            </>
          ) : (
            <Ticker>
              {(now) => {
                const done = s.completeAtIso ? Date.parse(s.completeAtIso) - now <= 0 : false;
                return done ? (
                  <button
                    type="button"
                    onClick={onClaim}
                    disabled={pending}
                    className="flex-1 rounded-lg bg-emerald-600 text-[12px] font-extrabold text-white active:scale-[0.98]"
                  >
                    보상 수령
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={onCancel}
                      disabled={pending}
                      className="rounded-lg bg-zinc-100 px-3 text-[11px] font-bold text-zinc-500 active:scale-95 dark:bg-zinc-800 dark:text-zinc-400"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={onCompleteNow}
                      disabled={pending}
                      className="flex-1 rounded-lg bg-amber-500 text-[11px] font-extrabold text-amber-950 active:scale-[0.98]"
                    >
                      💎 {Math.max(1, Math.ceil(Math.max(0, (s.completeAtIso ? Date.parse(s.completeAtIso) - now : 0)) / GEM_TO_MS)).toLocaleString('ko-KR')}로 즉시 완료
                    </button>
                  </>
                );
              }}
            </Ticker>
          )}
        </div>
      </div>
    </div>
  );
}
