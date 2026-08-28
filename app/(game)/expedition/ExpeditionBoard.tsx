'use client';

import { useCallback, useState, useTransition } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { Ticker } from '@/components/Ticker';
import { useDiamondActions } from '@/components/DiamondContext';
import { useDiamondGate } from '@/components/DiamondGate';
import {
  EXPEDITION_SYNERGY_GENERAL_BP,
  EXPEDITION_SYNERGY_MATCH_BP,
  type ExpeditionRegion, expeditionAsBonusBp } from '@/lib/game/balance';
import type { ExpeditionBoard, ExpeditionBoardSlot } from '@/lib/game/expedition/queries';
import type { ExpeditionReward } from '@/lib/game/expedition/engine';

import {
  cancelExpeditionAction,
  claimExpeditionAction,
  expeditionBoardAction,
  refreshOfferAction,
  startExpeditionAction,
  type ClaimActionResult,
} from './actions';

/**
 * 파견 보드(클라) — 낙관적 UI 우선(사용자 지시 2026-08-25):
 *  - 모든 변이는 로컬 예측을 즉시 그리고, 액션 응답의 board(서버 정본)로 수렴한다(§11.7 nextJob 패턴).
 *  - 다이아 소모(유료 리롤·슬롯 구매)는 useDiamondGate.ensure 사전 체크 + optimisticAdjust.
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

/** 클라 강화 배율 미리보기 — engine.asBonusBp와 동일 산식(표시 전용, 권위는 서버). */
function enhanceBonusOf(avatarSum: number): number {
  return expeditionAsBonusBp(avatarSum);
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
  const [assignSlot, setAssignSlot] = useState<number | null>(null);
  const assignFor = assignSlot === null ? null : (board.slots.find((x) => x.slot === assignSlot) ?? null);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<number | null>(null);
  const [claimPopup, setClaimPopup] = useState<ClaimPopup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { optimisticAdjust } = useDiamondActions();
  const gate = useDiamondGate();

  const showError = (code: string) => {
    const msg: Record<string, string> = {
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
    setAssignSlot(null);
    setSelectedAvatar(null);
    run(
      s.slot,
      (b) => ({
        ...b,
        slots: b.slots.map((x) =>
          x.slot === s.slot
            ? {
                ...x,
                state: 'running',
                completeAtIso: new Date(Date.now() + (s.hours ?? 0) * 3_600_000).toISOString(),
                synergyBp: syn,
                reqBonusBp: enhanceBonusOf(av?.enhanceSum ?? 0),
                avatarId,
                avatarFace: av?.face ?? null,
                avatarSouth: av?.south ?? null,
              }
            : x,
        ),
        avatars: b.avatars.map((a) => (a.id === avatarId ? { ...a, busy: true } : a)),
      }),
      () => startExpeditionAction(s.slot, avatarId),
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


  const xpPct = Math.min(100, Math.round((board.xp / Math.max(1, board.xpNext)) * 100));
  const selectedAv = selectedAvatar ? board.avatars.find((a) => a.id === selectedAvatar) ?? null : null;
  const previewBp =
    assignFor?.region && selectedAv ? synergyOf(selectedAv.regions, assignFor.region) + enhanceBonusOf(selectedAv.enhanceSum) : 0;
  const cancelSlot = cancelFor === null ? null : (board.slots.find((x) => x.slot === cancelFor) ?? null);

  /** 카드 탭 — 상태별 팝업/액션(카드에는 버튼이 없다, 2026-08-28 UI 개편). */
  const onCardTap = (s: ExpeditionBoardSlot) => {
    if (pendingSlot === s.slot) return;
    if (s.state === 'locked') {
      setError(`합산 강화 ${(s.unlock?.enhanceSum ?? 0).toLocaleString('ko-KR')} 달성 시 열려요`);
      setTimeout(() => setError(null), 2000);
      return;
    }
    if (s.state === 'offer') {
      setAssignSlot(s.slot);
      // 기본 선택 = 배정 가능한 아바타 중 강화 합 최대(배율 최대).
      setSelectedAvatar([...board.avatars].filter((a) => !a.busy).sort((x, y) => y.enhanceSum - x.enhanceSum)[0]?.id ?? null);
      return;
    }
    const done = s.completeAtIso ? Date.parse(s.completeAtIso) <= nowMs() : false;
    if (done) doClaim(s);
    else setCancelFor(s.slot);
  };

  return (
    <div className="space-y-2.5">
      {/* 헤더 — 스탯 칩 4 + XP 바(2026-08-28 UI 개편) */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          ['Lv', String(board.level)],
          ['대성공', `${(board.critBp / 100).toFixed(1)}%`],
          ['합산 강화', board.enhanceSum.toLocaleString('ko-KR')],
          ['새로고침', board.freeRefreshLeft > 0 ? `${board.freeRefreshLeft}회` : `💎${board.refreshCost}`],
        ].map(([k, v]) => (
          <div key={k} className="flex h-[46px] flex-col items-center justify-center rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60">
            <span className="text-[9px] text-zinc-400 dark:text-zinc-500">{k}</span>
            <b className="text-[13px] leading-tight text-zinc-800 dark:text-zinc-50">{v}</b>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-0.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${xpPct}%` }} />
        </div>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">다음 레벨 {Math.max(0, board.xpNext - board.xp)} XP</span>
      </div>

      {/* 에러 — 목록을 밀지 않는 하단 고정 토스트(레이아웃 시프트 0 규칙) */}
      {error ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-6">
          <span className="rounded-full bg-red-600/95 px-4 py-2 text-[11.5px] font-bold text-white shadow-lg">{error}</span>
        </div>
      ) : null}

      {/* 슬롯 — 카드 전체가 탭 대상 */}
      {board.slots.map((s) => (
        <SlotCard key={s.slot} s={s} pending={pendingSlot === s.slot} enhanceSum={board.enhanceSum} onTap={() => onCardTap(s)} />
      ))}

      {/* 원정대원 선택 — 미니 카드(선택 대원 기준 확정 보상) + 아바타 그리드 + [닫기 · 다른 미션 · 파견 보내기] */}
      {assignFor?.region ? (
        <ModalShell onClose={() => setAssignSlot(null)} label="원정대원 선택">
          <ModalLayout
            title="원정대원 선택"
            subtitle={
              <>
                <span style={{ color: REGION_UI[assignFor.region].color }}>{REGION_UI[assignFor.region].label}</span> · {assignFor.hours}시간 — 강화 합이 높을수록 보상↑
              </>
            }
            bodyPad="sm"
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setAssignSlot(null)}>
                  닫기
                </ModalButton>
                <ModalButton tone="neutral" disabled={pendingSlot === assignFor.slot} onClick={() => doRefresh(assignFor)}>
                  ↻ 다른 미션 {board.freeRefreshLeft > 0 ? `${board.freeRefreshLeft}회` : `💎${board.refreshCost}`}
                </ModalButton>
                <ModalButton tone="contrast" disabled={!selectedAvatar || pendingSlot === assignFor.slot} onClick={() => selectedAvatar && doStart(assignFor, selectedAvatar)}>
                  파견 보내기
                </ModalButton>
              </>
            }
          >
            <CardBody
              region={assignFor.region}
              hours={assignFor.hours ?? 0}
              avatarSouth={selectedAv?.south ?? null}
              bonusBp={previewBp}
              big={assignFor.reward ? '확정 보상' : '새 미션 찾는 중…'}
              reward={assignFor.reward ? previewFinal(assignFor.reward, previewBp) : undefined}
              hint="선택 대원 기준"
              compact
            />
            {/* 고정 높이 그리드(내부 스크롤) — 아바타 수와 무관하게 팝업 높이 불변(레이아웃 시프트 0). */}
            <div className="mt-2 h-[132px] overflow-y-auto rounded-xl border border-zinc-100 p-1.5 dark:border-zinc-800/60">
              <div className="grid grid-cols-4 gap-1.5">
                {board.avatars.map((a) => {
                  const mult = 1 + (enhanceBonusOf(a.enhanceSum) + synergyOf(a.regions, assignFor.region!)) / 10000;
                  const sel = selectedAvatar === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={a.busy}
                      onClick={() => setSelectedAvatar(a.id)}
                      className={`relative flex h-[116px] flex-col items-center justify-end gap-0.5 rounded-xl border p-1.5 text-center transition ${
                        sel ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-200 dark:border-zinc-800'
                      } ${a.busy ? 'opacity-40' : 'active:scale-95'}`}
                    >
                      <span className="flex h-12 items-end justify-center">
                        {a.south ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.south} alt="" decoding="async" className="h-12 w-auto" style={{ imageRendering: 'pixelated' }} />
                        ) : null}
                      </span>
                      <span className="block h-3.5 text-[9px] font-bold text-zinc-600 dark:text-zinc-300">{a.busy ? '파견 중' : `강화 합 ${a.enhanceSum}`}</span>
                      <span className="block h-3.5 text-[10px] font-extrabold text-sky-600 dark:text-sky-400">×{mult.toFixed(2)}</span>
                      {a.isActive ? <span className="absolute top-1 right-1 rounded bg-zinc-800/80 px-1 text-[8px] font-bold text-white">대표</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </ModalLayout>
        </ModalShell>
      ) : null}

      {/* 취소 확인 */}
      {cancelFor !== null ? (
        <ModalShell onClose={() => setCancelFor(null)} label="파견 취소">
          <ModalLayout
            title="파견을 취소할까요?"
            subtitle={
              cancelSlot?.region ? (
                <>
                  <span style={{ color: REGION_UI[cancelSlot.region].color }}>{REGION_UI[cancelSlot.region].label}</span> · {cancelSlot.hours}시간 파견 중
                </>
              ) : undefined
            }
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setCancelFor(null)}>
                  계속 파견
                </ModalButton>
                <ModalButton tone="danger" onClick={() => doCancel(cancelFor)}>
                  파견 취소
                </ModalButton>
              </>
            }
          >
            <p className="text-center text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              보상 없이 파견이 종료돼요. 슬롯은 바로 새 미션으로 채워집니다.
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}

      {/* 수령 팝업 — 대성공은 서버 판정이라 응답 후 표시 */}
      {claimPopup ? (
        <ModalShell onClose={() => setClaimPopup(null)} label="파견 귀환">
          <ModalLayout
            title={claimPopup.crit ? '✨ 대성공!' : '파견 귀환'}
            subtitle={
              <>
                <span style={{ color: REGION_UI[claimPopup.region].color }}>{REGION_UI[claimPopup.region].label}</span> 원정대가 돌아왔습니다
              </>
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
              <p className="h-4 text-[11px] text-zinc-500 dark:text-zinc-400">{claimPopup.reward.boxes ? boxDetail(claimPopup.reward) : ''}</p>
              <p className="h-4 text-[11px] font-bold text-amber-600 dark:text-amber-400">{claimPopup.crit ? '대성공으로 수량이 2배가 됐어요!' : ''}</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                파견 XP +{claimPopup.xpGained}
                {claimPopup.levelUp ? <b className="ml-1 text-amber-600 dark:text-amber-400">— Lv.{claimPopup.level} 달성!</b> : null}
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

/** 보상 축약 표기(카드용) — "📦 3 + 💎 41". */
function rewardShort(r: ExpeditionReward | undefined): string {
  if (!r) return '…';
  const parts: string[] = [];
  if (r.boxes) {
    const t = r.boxes.weapon + r.boxes.armor + r.boxes.accessory;
    if (t > 0) parts.push(`📦 ${t}`);
  }
  if (r.diamond) parts.push(`💎 ${r.diamond.toLocaleString('ko-KR')}`);
  return parts.join(' + ') || '—';
}

/** 이벤트 핸들러 전용 현재 시각 — 렌더 경로에서 호출 금지(React 컴파일러 순수성 규칙). */
const nowMs = () => Date.now();

/** 시간 → 몬스터 단계(t1~t4). */
const MON_TIER: Record<number, number> = { 4: 1, 8: 2, 12: 3, 24: 4 };
/** 미배정 실루엣 — 기본 남 스프라이트(흑백·30%). */
const GHOST_SRC = '/sprites/default/male/south.png';

/**
 * 카드 본문(2026-08-28 UI 개편, 최종안 v7) — 헤더 26px(좌 상태 · 중앙 지역 · 우 시간) + 본문 중앙 정렬.
 * 좌: 원정대원 전신 76px + 배율 배지(18px 고정 — 미배정은 hidden으로 자리 유지) / 중앙 3줄 고정 높이
 * (값 26 · 보상 20 · 힌트 14 — 폰트 고정, 상태 전환 시 시프트 0) / 우: 지역 몬스터(반전) + XP 배지.
 */
function CardBody({
  region,
  hours,
  avatarSouth,
  bonusBp,
  big,
  bigCls,
  reward,
  hint,
  tag,
  tagCls,
  compact,
  glow,
  children,
}: {
  region: ExpeditionRegion;
  hours: number;
  avatarSouth: string | null;
  bonusBp: number;
  big: React.ReactNode;
  bigCls?: string;
  reward: ExpeditionReward | undefined;
  hint: string;
  tag?: string;
  tagCls?: string;
  compact?: boolean;
  glow?: boolean;
  children?: React.ReactNode;
}) {
  const ui = REGION_UI[region];
  const hc = HOUR_CLS[hours] ?? 'bg-zinc-800 text-zinc-300';
  const bodyH = compact ? 60 : 76;
  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-cover bg-center ${compact ? 'h-[112px]' : 'h-[128px]'} ${
        glow ? 'border-emerald-400/70' : 'border-zinc-800'
      }`}
      style={{ backgroundImage: `url(/sprites/expedition/bg/${region}.png)` }}
    >
      {/* 가독성 — 전면 35% 어둡게 + 상·하 그라데이션 */}
      <div className="pointer-events-none absolute inset-0 bg-black/35" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-9 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/70 to-transparent" />
      {/* 헤더 — 좌 상태 / 중앙 지역명 / 우 시간(좌·우는 76px 열 중앙 = 아래 배지와 세로 정렬) */}
      <div className="relative grid h-[26px] grid-cols-[76px_1fr_76px] items-center px-2.5">
        <span className="justify-self-center">
          {tag ? <span className={`rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-black ${tagCls ?? 'text-zinc-300'}`}>{tag}</span> : null}
        </span>
        <b className="justify-self-center truncate text-[12.5px] font-black text-white drop-shadow" style={{ color: ui.color }}>
          {ui.label}
        </b>
        <span className={`justify-self-center rounded-md px-1.5 py-0.5 text-[9px] font-black ${hc}`}>{hours}시간</span>
      </div>
      {/* 본문 — 헤더 아래 영역 정중앙(헤더 높이만큼 위로 보정) */}
      <div className={`relative -mt-2 flex items-center justify-between px-2.5 ${compact ? 'h-[86px]' : 'h-[102px]'}`}>
        <div className="flex w-[76px] flex-none flex-col items-center justify-end gap-0.5" style={{ height: bodyH + 22 }}>
          <span className="flex items-end justify-center" style={{ height: bodyH }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarSouth ?? GHOST_SRC}
              alt=""
              decoding="async"
              className={avatarSouth ? 'drop-shadow-[0_2px_2px_rgba(0,0,0,.8)]' : 'opacity-30 grayscale brightness-150'}
              style={{ height: bodyH, width: 'auto', imageRendering: 'pixelated' }}
            />
          </span>
          <span className={`h-[18px] rounded-md bg-black/70 px-1.5 text-[10px] font-black leading-[18px] text-sky-400 ${avatarSouth ? '' : 'invisible'}`}>
            ×{(1 + bonusBp / 10000).toFixed(2)}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center text-center">
          <b className={`block h-[26px] w-full truncate text-[17px] font-black leading-[26px] drop-shadow ${bigCls ?? 'text-white'}`}>{big}</b>
          <span className="block h-5 w-full truncate text-[14px] font-black leading-5 text-white drop-shadow">{rewardShort(reward)}</span>
          <span className="block h-3.5 w-full truncate text-[9.5px] font-medium leading-[14px] text-zinc-300/80">{hint}</span>
        </div>
        <div className="flex w-[76px] flex-none flex-col items-center justify-end gap-0.5" style={{ height: bodyH + 22 }}>
          <span className="flex items-end justify-center" style={{ height: bodyH }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/sprites/expedition/mon/${region}-t${MON_TIER[hours] ?? 1}.png`}
              alt=""
              decoding="async"
              className="drop-shadow-[0_2px_2px_rgba(0,0,0,.8)]"
              style={{ height: compact ? 44 : 52, width: 'auto', imageRendering: 'pixelated', transform: 'scaleX(-1)' }}
            />
          </span>
          <span className="h-[18px] rounded-md bg-black/70 px-1.5 text-[10px] font-black leading-[18px] text-zinc-200">+{hours} XP</span>
        </div>
      </div>
      {children}
    </div>
  );
}

function SlotCard({ s, pending, enhanceSum, onTap }: { s: ExpeditionBoardSlot; pending: boolean; enhanceSum: number; onTap: () => void }) {
  if (s.state === 'locked') {
    // 잠금 — 같은 128px, 흑백 + 점선. 좌 🔒 · 중앙 3줄(필요 수치 / 달성 시 오픈 / 현재) · 우 진행 바. 배지 없음.
    const need = s.unlock?.enhanceSum ?? 0;
    const pct = need > 0 ? Math.min(100, Math.floor((enhanceSum / need) * 100)) : 0;
    const bg = s.slot === 3 ? 'kingdom' : 'angel';
    return (
      <button
        type="button"
        onClick={onTap}
        className={`relative block h-[128px] w-full overflow-hidden rounded-xl border border-dashed border-zinc-600 bg-cover bg-center text-left grayscale ${s.slot === 4 ? 'opacity-50' : 'opacity-85'}`}
        style={{ backgroundImage: `url(/sprites/expedition/bg/${bg}.png)` }}
      >
        <div className="pointer-events-none absolute inset-0 bg-black/60" />
        <div className="relative grid h-[26px] grid-cols-[76px_1fr_76px] items-center px-2.5">
          <span />
          <b className="justify-self-center text-[12.5px] font-black text-white">슬롯 {s.slot}</b>
          <span />
        </div>
        <div className="relative -mt-2 flex h-[102px] items-center justify-between px-2.5">
          <span className="flex w-[76px] justify-center text-[22px]">🔒</span>
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center text-center">
            <b className="block h-[26px] text-[17px] font-black leading-[26px] text-white">{need.toLocaleString('ko-KR')}</b>
            <span className="block h-5 text-[13px] font-extrabold leading-5 text-white">합산 강화 달성 시 오픈</span>
            <span className="block h-3.5 text-[9.5px] leading-[14px] text-zinc-300/80">현재 {enhanceSum.toLocaleString('ko-KR')}</span>
          </div>
          <div className="flex w-[76px] flex-col items-center gap-1">
            <div className="h-1 w-[70px] overflow-hidden rounded-full bg-zinc-700">
              <div className="h-full bg-zinc-300" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[9.5px] font-medium tabular-nums text-zinc-300/80">{pct}%</span>
          </div>
        </div>
      </button>
    );
  }
  const region = s.region!;
  const hours = s.hours ?? 0;
  const bonus = s.reqBonusBp ?? 0;
  return (
    <button type="button" onClick={onTap} disabled={pending} className={`block w-full text-left transition active:scale-[0.99] ${pending ? 'opacity-70' : ''}`}>
      {s.state === 'offer' ? (
        <CardBody region={region} hours={hours} avatarSouth={null} bonusBp={0} big="파견 대기" reward={s.reward} hint="탭해서 파견" tag="미배정" />
      ) : (
        <Ticker>
          {(now) => {
            const remain = s.completeAtIso ? Date.parse(s.completeAtIso) - now : 0;
            const done = remain <= 0;
            return (
              <CardBody
                region={region}
                hours={hours}
                avatarSouth={s.avatarSouth ?? null}
                bonusBp={bonus + (s.synergyBp ?? 0)}
                big={done ? '파견 완료' : <span className="tabular-nums">{fmtRemain(remain)}</span>}
                bigCls={done ? 'text-emerald-400' : 'text-amber-400'}
                reward={s.reward}
                hint={done ? '탭해서 완료' : '탭해서 취소'}
                tag={done ? '귀환' : '파견 중'}
                tagCls={done ? 'text-emerald-400' : 'text-amber-400'}
                glow={done}
              />
            );
          }}
        </Ticker>
      )}
    </button>
  );
}
