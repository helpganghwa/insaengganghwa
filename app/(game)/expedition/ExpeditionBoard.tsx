'use client';

import { useCallback, useState, useTransition } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { Ticker } from '@/components/Ticker';
import { useDiamondActions } from '@/components/DiamondContext';
import { useDiamondGate } from '@/components/DiamondGate';
import {
  EXPEDITION_DIFFICULTY_LABEL,
  EXPEDITION_SYNERGY_GENERAL_BP,
  EXPEDITION_SYNERGY_MATCH_BP,
  GEM_TO_MS,
  type ExpeditionDifficulty,
  type ExpeditionRegion,
} from '@/lib/game/balance';
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

const REGION_UI: Record<ExpeditionRegion, { emoji: string; label: string }> = {
  swamp: { emoji: '🏞️', label: '슬라임 늪' },
  orc: { emoji: '🪓', label: '오크 부락' },
  kingdom: { emoji: '🏰', label: '왕국' },
  temple: { emoji: '⛩️', label: '잊힌 신전' },
  volcano: { emoji: '🌋', label: '드래곤 화산' },
  angel: { emoji: '🪽', label: '타락 천사 부유섬' },
};
const DIFF_CLS: Record<ExpeditionDifficulty, string> = {
  easy: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  normal: 'bg-sky-500/15 text-sky-400 border-sky-500/40',
  hard: 'bg-orange-500/15 text-orange-400 border-orange-500/40',
  grand: 'bg-red-500/15 text-red-400 border-red-500/40',
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
    if (total > 0) parts.push(`📦 ${total}개`);
  }
  if (r.diamond) parts.push(`💎 ${r.diamond.toLocaleString('ko-KR')}`);
  return <b className={strong ? 'text-amber-400' : 'text-zinc-200'}>{parts.join(' + ')}</b>;
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

  /** 액션 공통 — 실패 시 서버 보드 재동기(낙관 예측 롤백). */
  const run = useCallback(
    (slot: number | null, optimistic: (b: ExpeditionBoard) => ExpeditionBoard, act: () => Promise<{ ok: boolean; code?: string; board?: ExpeditionBoard }>) => {
      setPendingSlot(slot);
      setBoard(optimistic);
      startTransition(async () => {
        const r = await act();
        if (r.ok && r.board) setBoard(r.board);
        else {
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
    // 다이아는 비크리 기준 낙관 선반영 — 대성공이면 응답 보드가 위로 수렴(추가분은 팝업으로 체감).
    if (s.reward?.diamond) optimisticAdjust(BigInt(s.reward.diamond));
    setPendingSlot(s.slot);
    startTransition(async () => {
      const r: ClaimActionResult = await claimExpeditionAction(s.slot);
      if (r.ok) {
        setBoard(r.board);
        setClaimPopup({ crit: r.crit, reward: r.reward, xpGained: r.xpGained, level: r.level, levelUp: r.levelUp, region: s.region! });
      } else {
        showError(r.code);
        const fresh = await expeditionBoardAction();
        if (fresh.ok) setBoard(fresh.board);
      }
      setPendingSlot(null);
    });
  };

  const doPurchase = (s: ExpeditionBoardSlot) => {
    const cost = s.unlock?.diamond ?? 0;
    if (!gate.ensure(cost)) return;
    optimisticAdjust(BigInt(-cost));
    run(null, (b) => b, () => purchaseExpeditionSlotAction(s.slot));
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
            오늘 파견 <b className="text-amber-600 dark:text-amber-400">{6 - board.startsLeft}</b>/6
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

      {error ? (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-center text-[11.5px] font-bold text-red-500">{error}</div>
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
            setSelectedAvatar(board.avatars.find((a) => !a.busy)?.id ?? null);
          }}
          onCancel={() => setCancelFor(s.slot)}
          onCompleteNow={() => doCompleteNow(s)}
          onClaim={() => doClaim(s)}
          onPurchase={() => doPurchase(s)}
        />
      ))}

      {/* 아바타 배정 시트 */}
      {assignFor?.region ? (
        <ModalShell onClose={() => setAssignFor(null)} label="원정대원 선택">
          <ModalLayout
            title={`${REGION_UI[assignFor.region].emoji} ${REGION_UI[assignFor.region].label}`}
            subtitle={`${EXPEDITION_DIFFICULTY_LABEL[assignFor.difficulty!]} · ${assignFor.hours}시간 — 원정대원을 고르세요`}
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
                  {board.startsLeft <= 0 ? '오늘 횟수 소진' : `파견 보내기 (오늘 ${6 - board.startsLeft}/6)`}
                </ModalButton>
              </>
            }
          >
            <div className="grid grid-cols-4 gap-2 p-1">
              {board.avatars.map((a) => {
                const syn = synergyOf(a.regions, assignFor.region!);
                const sel = selectedAvatar === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={a.busy}
                    onClick={() => setSelectedAvatar(a.id)}
                    className={`relative rounded-xl border p-1.5 text-center transition ${
                      sel
                        ? 'border-amber-500 bg-amber-500/10'
                        : 'border-zinc-200 dark:border-zinc-800'
                    } ${a.busy ? 'opacity-40' : 'active:scale-95'}`}
                  >
                    <span className="mx-auto block h-12 w-12 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                      {a.face ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.face} alt="" decoding="async" className="h-full w-full" style={{ imageRendering: 'pixelated' }} />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-lg">👤</span>
                      )}
                    </span>
                    <span className={`mt-1 block text-[9px] font-bold ${syn > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'}`}>
                      {a.busy ? '⏳ 파견 중' : syn > 0 ? `🎨 +${syn / 100}%` : '+0%'}
                    </span>
                    {a.isActive ? (
                      <span className="absolute top-1 right-1 rounded bg-zinc-800/80 px-1 text-[8px] font-bold text-white">대표</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {selectedAvatar && assignFor.reward ? (
              <p className="px-2 pt-1 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
                최종 보상 미리보기:{' '}
                <RewardLine
                  r={previewFinal(assignFor.reward, synergyOf(board.avatars.find((a) => a.id === selectedAvatar)?.regions ?? [], assignFor.region!) + board.bonusBp)}
                  strong
                />
                <span className="ml-1 text-[10px] text-zinc-400">(시작 시 확정)</span>
              </p>
            ) : null}
            <p className="px-2 pt-1 pb-1 text-center text-[10px] text-zinc-400 dark:text-zinc-500">
              파견 취소 시 보상은 없고 오늘 횟수는 돌아오지 않아요
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
              보상을 받을 수 없고, 사용한 오늘 파견 횟수는 돌아오지 않아요.
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}

      {/* 수령 팝업 — 대성공은 서버 판정이라 응답 후 표시 */}
      {claimPopup ? (
        <ModalShell onClose={() => setClaimPopup(null)} label="파견 귀환">
          <ModalLayout
            title={claimPopup.crit ? '✨ 대성공!' : '파견 귀환'}
            subtitle={`${REGION_UI[claimPopup.region].emoji} ${REGION_UI[claimPopup.region].label}`}
            footer={
              <ModalButton tone="contrast" onClick={() => setClaimPopup(null)}>
                확인
              </ModalButton>
            }
          >
            <div className="space-y-2 text-center">
              <p className={`text-lg font-extrabold ${claimPopup.crit ? 'text-amber-500' : ''}`}>
                <RewardLine r={claimPopup.reward} strong={claimPopup.crit} />
              </p>
              {claimPopup.reward.boxes ? (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{boxDetail(claimPopup.reward)} — 보급소에서 개봉</p>
              ) : null}
              {claimPopup.crit ? (
                <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">대성공으로 수량이 2배가 됐어요!</p>
              ) : null}
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                파견 XP +{claimPopup.xpGained}
                {claimPopup.levelUp ? (
                  <b className="ml-1 text-amber-600 dark:text-amber-400">— Lv.{claimPopup.level} 달성! 보상 +{claimPopup.level}%</b>
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
  if (s.state === 'locked') {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 p-3 text-center dark:border-zinc-700">
        <p className="text-[11.5px] text-zinc-400 dark:text-zinc-500">
          🔒 슬롯 {s.slot} — <b className="text-zinc-500 dark:text-zinc-400">파견 Lv.{s.unlock?.level}</b> 달성 시 무료 오픈
        </p>
        <button
          type="button"
          onClick={onPurchase}
          className="mt-2 rounded-lg bg-zinc-100 px-4 py-1.5 text-[11.5px] font-bold text-zinc-600 active:scale-95 dark:bg-zinc-800 dark:text-zinc-300"
        >
          💎 {s.unlock?.diamond.toLocaleString('ko-KR')}으로 바로 열기
        </button>
      </div>
    );
  }

  const region = s.region ? REGION_UI[s.region] : null;
  const diffCls = s.difficulty ? DIFF_CLS[s.difficulty] : '';

  return (
    <div className={`rounded-xl border p-3 ${pending ? 'opacity-70' : ''} border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60`}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[13px] font-extrabold">
          {region ? `${region.emoji} ${region.label}` : '…'}
          {s.difficulty ? (
            <span className={`ml-1.5 rounded-md border px-1.5 py-0.5 align-[2px] text-[9px] font-black ${diffCls}`}>
              {EXPEDITION_DIFFICULTY_LABEL[s.difficulty]} · {s.hours}h
            </span>
          ) : null}
        </p>
        {s.state === 'offer' ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={pending}
            aria-label="미션 새로고침"
            className="shrink-0 rounded-lg bg-zinc-100 px-2.5 py-1 text-[12px] active:scale-95 dark:bg-zinc-800"
          >
            🔄
          </button>
        ) : (
          <Ticker>
            {(now) => {
              const remain = s.completeAtIso ? Date.parse(s.completeAtIso) - now : 0;
              return remain <= 0 ? (
                <span className="shrink-0 text-[12px] font-extrabold text-emerald-500">귀환 완료!</span>
              ) : (
                <span className="shrink-0 text-[12px] font-extrabold tabular-nums text-amber-600 dark:text-amber-400">⏳ {fmtRemain(remain)}</span>
              );
            }}
          </Ticker>
        )}
      </div>

      <p className="mt-1 text-[10.5px] text-zinc-500 dark:text-zinc-400">
        {s.reward ? (
          <>
            {s.state === 'offer' ? '확정 보상 ' : '보상 '}
            <RewardLine r={s.reward} />
            {s.state === 'offer' ? <span className="ml-1 text-zinc-400 dark:text-zinc-500">· 시너지·레벨 보너스는 배정 시 가산</span> : null}
            {s.state === 'running' && (s.synergyBp ?? 0) > 0 ? (
              <span className="ml-1 font-bold text-amber-600 dark:text-amber-400">🎨 +{(s.synergyBp ?? 0) / 100}%</span>
            ) : null}
          </>
        ) : (
          '새 미션 찾는 중…'
        )}
      </p>

      {s.state === 'offer' ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/60">
          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-zinc-200 text-base dark:bg-zinc-800">👤</span>
          <span className="text-[11px] text-zinc-400">아바타를 배정하세요</span>
          <button
            type="button"
            onClick={onAssign}
            disabled={pending}
            className="ml-auto rounded-lg bg-amber-500 px-3.5 py-1.5 text-[11.5px] font-extrabold text-amber-950 active:scale-95"
          >
            배정
          </button>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-zinc-200 dark:bg-zinc-800">
            {s.avatarFace ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.avatarFace} alt="" decoding="async" className="h-full w-full" style={{ imageRendering: 'pixelated' }} />
            ) : (
              '👤'
            )}
          </span>
          <Ticker>
            {(now) => {
              const done = s.completeAtIso ? Date.parse(s.completeAtIso) - now <= 0 : false;
              return done ? (
                <button
                  type="button"
                  onClick={onClaim}
                  disabled={pending}
                  className="ml-auto flex-1 rounded-lg bg-emerald-600 py-2 text-[12px] font-extrabold text-white active:scale-[0.98]"
                >
                  보상 수령
                </button>
              ) : (
                <span className="ml-auto flex gap-1.5">
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={pending}
                    className="rounded-lg bg-zinc-100 px-3 py-1.5 text-[11px] font-bold text-zinc-500 active:scale-95 dark:bg-zinc-800 dark:text-zinc-400"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={onCompleteNow}
                    disabled={pending}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-extrabold text-amber-950 active:scale-95"
                  >
                    💎 {Math.max(1, Math.ceil(Math.max(0, (s.completeAtIso ? Date.parse(s.completeAtIso) - now : 0)) / GEM_TO_MS)).toLocaleString('ko-KR')}로 즉시 완료
                  </button>
                </span>
              );
            }}
          </Ticker>
        </div>
      )}
    </div>
  );
}
