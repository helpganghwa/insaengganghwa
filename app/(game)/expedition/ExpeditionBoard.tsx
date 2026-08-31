'use client';

import { useCallback, useRef, useState, useTransition, useEffect } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { assetUrl } from '@/lib/asset-versions';
import { useResourceToast } from '@/components/ResourceToast';
import { clockOffsetMs, serverNow } from '@/lib/client/server-clock';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { Ticker } from '@/components/Ticker';
import { useDiamondActions } from '@/components/DiamondContext';
import { useDiamondGate } from '@/components/DiamondGate';
import {
  EXPEDITION_REFRESH_FREE_PER_DAY,
  EXPEDITION_SYNERGY_GENERAL_MULT,
  EXPEDITION_SYNERGY_MATCH_MULT,
  expeditionWeightedSum,
  type ExpeditionRegion, expeditionAsBonusBp,
  EXPEDITION_DIFFICULTIES,
  EXPEDITION_DIFFICULTY_DIST_BP,
  EXPEDITION_DIFFICULTY_HOURS,
  EXPEDITION_LEVEL_MAX,
  EXPEDITION_CRIT_MULT,
  expeditionCritBp,
  expeditionXpForHours,
  EXPEDITION_XP_RANGE_BY_HOURS,
  EXPEDITION_BASE_AMOUNTS,
  EXPEDITION_DURATION_SCALE,
} from '@/lib/game/balance';
import type { ExpeditionAvatar, ExpeditionBoard, ExpeditionBoardSlot } from '@/lib/game/expedition/queries';
import type { ExpeditionReward } from '@/lib/game/expedition/engine';

import {
  claimExpeditionAction,
  expeditionBoardAction,
  refreshAllOffersAction,
  startExpeditionAction,
  type ClaimActionResult,
} from './actions';

/**
 * 파견 보드(클라) — 낙관적 UI 우선(사용자 지시 2026-08-25):
 *  - 모든 변이는 로컬 예측을 즉시 그리고, 액션 응답의 board(서버 정본)로 수렴한다(§11.7 nextJob 패턴).
 *  - 다이아 소모(유료 리롤·슬롯 구매)는 useDiamondGate.ensure 사전 체크 + optimisticAdjust.
 *  - 수령 팝업만은 서버 응답을 기다린다 — 대성공(10%)이 수령 시 서버 롤이라 예측 불가.
 */

/** 레벨 구간표 — EXPEDITION_DIFFICULTY_DIST_BP(minLevel 내림차순)를 오름차순 구간 [min, max]로. */
const LEVEL_BANDS = [...EXPEDITION_DIFFICULTY_DIST_BP]
  .sort((a, b) => a.minLevel - b.minLevel)
  .map((b, i, arr) => ({ min: b.minLevel, max: i + 1 < arr.length ? arr[i + 1]!.minLevel - 1 : EXPEDITION_LEVEL_MAX, dist: b.dist }));

/** 시간 표시 — 달 아이콘(🌘→🌕)으로 길이를 표현(M6, 2026-08-28). 색은 흰색 단일이라 지역색과 충돌 없음. */
// 2/4/8/12h(2026-09-01) — 24는 배포 전 진행분 표시 폴백.
const HOUR_MOON: Record<number, string> = { 2: '🌒', 4: '🌓', 8: '🌔', 12: '🌕', 24: '🌕' };

/** 지역 표기 — 이모지 대신 지역색(월드맵 노드 REGION_COLOR와 일치, UI 피드백 2026-08-25). */
const REGION_UI: Record<ExpeditionRegion, { color: string; label: string }> = {
  swamp: { color: '#22c55e', label: '슬라임 늪' },
  orc: { color: '#f97316', label: '오크 부락' },
  kingdom: { color: '#fbbf24', label: '왕국' },
  temple: { color: '#60a5fa', label: '잊힌 신전' },
  volcano: { color: '#ef4444', label: '드래곤 화산' },
  angel: { color: '#c084fc', label: '타락 천사 부유섬' },
};

/** 남은 시간 — 강화 카드(fmtRemaining)와 같은 표기: "5시간 12분 48초" / "12분 48초" / "48초". */
function fmtRemain(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}시간 ${m}분 ${sec}초` : m > 0 ? `${m}분 ${sec}초` : `${sec}초`;
}



/** 클라 강화 배율 미리보기 — engine.asBonusBp와 동일 산식(표시 전용, 권위는 서버). */
function enhanceBonusOf(avatarSum: number): number {
  return expeditionAsBonusBp(avatarSum);
}

/** 클라 가중 강화 합 미리보기 — 서버(engine.avatarWeightedSum)와 동일 산식(표시 전용, 권위는 서버). */
function weightedSumOf(equipment: ExpeditionAvatar['equipment'], mission: ExpeditionRegion): number {
  return expeditionWeightedSum(equipment.map((e) => ({ level: e.level, region: e.region })), mission);
}

type ClaimPopup = { crit: boolean; reward: ExpeditionReward; baseReward?: ExpeditionReward; xpGained: number; level: number; levelUp: boolean; region: ExpeditionRegion; hours: number; avatarSouth: string | null; bonusText: string | null };

export function ExpeditionBoardView({ initial }: { initial: ExpeditionBoard }) {
  const [board, setBoard] = useState(initial);
  const [pendingSlot, setPendingSlot] = useState<number | null>(null);
  const [assignSlot, setAssignSlot] = useState<number | null>(null);
  const assignFor = assignSlot === null ? null : (board.slots.find((x) => x.slot === assignSlot) ?? null);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [claimPopup, setClaimPopup] = useState<ClaimPopup | null>(null);
  const [, startTransition] = useTransition();
  const { optimisticAdjust } = useDiamondActions();
  const gate = useDiamondGate();

  const toast = useResourceToast();
  // 공용 헤더 토스트(ResourceToast) — 페이지 전용 토스트 금지(2026-08-28).
  const showError = useCallback(
    (code: string) => {
      const msg: Record<string, string> = {
        AVATAR_BUSY: '이미 파견 중인 아바타예요',
        INSUFFICIENT_DIAMOND: '다이아가 부족해요',
        NOT_READY: '아직 귀환하지 않았어요',
        DAILY_LIMIT: '이 슬롯은 오늘 이미 보냈어요 — 내일 다시 보낼 수 있어요',
      };
      toast.showError(msg[code] ?? '잠시 후 다시 시도해주세요');
    },
    [toast],
  );

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
    [showError],
  );

  const [refreshAsk, setRefreshAsk] = useState(false);
  const [levelInfo, setLevelInfo] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /** 전체 새로고침(2026-08-28) — 미배정 슬롯 전부 리롤, 진행 중 제외. 횟수 1회 차감. */
  const doRefreshAll = () => {
    setRefreshAsk(false);
    const paid = board.freeRefreshLeft <= 0;
    if (paid && !gate.ensure(board.refreshCost)) return;
    if (paid) optimisticAdjust(BigInt(-board.refreshCost));
    // 낙관: 리롤 내용은 서버만 알므로 기존 카드는 그대로 두고(폴백 문자 없음) 상태줄만 '새 파견 찾는 중…'.
    setRefreshing(true);
    run(
      null,
      (b) => ({ ...b, freeRefreshLeft: paid ? 0 : b.freeRefreshLeft - 1 }),
      async () => {
        const r = await refreshAllOffersAction();
        setRefreshing(false);
        return r;
      },
      paid ? () => optimisticAdjust(BigInt(board.refreshCost)) : undefined,
    );
  };

  const doStart = (s: ExpeditionBoardSlot, avatarId: string) => {
    const av = board.avatars.find((a) => a.id === avatarId);
    const ws = av && s.region ? weightedSumOf(av.equipment, s.region) : (av?.enhanceSum ?? 0);
    const syn = av ? Math.max(0, enhanceBonusOf(ws) - enhanceBonusOf(av.enhanceSum)) : 0;
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
                reqBonusBp: enhanceBonusOf(ws),
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


  const doClaim = (s: ExpeditionBoardSlot) => {
    // 낙관적(2026-08-28): 탭 즉시 ① 다이아 선반영(비크리 기준) ② 슬롯을 '새 미션 찾는 중' 오퍼로 비움
    // ③ 아바타 잠금 해제. 대성공은 서버 롤이라 팝업만 응답 후 — 실패 시 전부 역보정 + 서버 보드 재동기.
    const preAdd = s.reward?.diamond ?? 0;
    if (preAdd > 0) optimisticAdjust(BigInt(preAdd));
    const prev = board;
    setBoard((b) => ({
      ...b,
      // 지역·시간은 유지(카드 렌더에 필요) — 보상만 비워 '새 파견 찾는 중…'으로.
      slots: b.slots.map((x) =>
        x.slot === s.slot
          ? { ...x, state: 'offer' as const, reward: undefined, completeAtIso: undefined, avatarId: undefined, avatarSouth: null, reqBonusBp: 0, synergyBp: 0 }
          : x,
      ),
      avatars: b.avatars.map((a) => (a.id === s.avatarId ? { ...a, busy: false } : a)),
    }));
    setPendingSlot(s.slot);
    startTransition(async () => {
      const r: ClaimActionResult = await claimExpeditionAction(s.slot);
      if (r.ok) {
        // 크리·시작가 차이 보정 — 실지급(r.reward)과 선반영(preAdd)의 차액만 추가 반영.
        const diff = (r.reward.diamond ?? 0) - preAdd;
        if (diff !== 0) optimisticAdjust(BigInt(diff));
        setBoard(r.board);
        setClaimPopup({
          crit: r.crit, reward: r.reward, xpGained: r.xpGained, level: r.level, levelUp: r.levelUp, region: s.region!,
          hours: s.hours ?? 0, avatarSouth: s.avatarSouth ?? null, baseReward: s.baseReward,
          bonusText: `×${(1 + (s.reqBonusBp ?? 0) / 10000).toFixed(2)}`,
        });
      } else {
        if (preAdd > 0) optimisticAdjust(BigInt(-preAdd));
        setBoard(prev);
        showError(r.code);
        const fresh = await expeditionBoardAction();
        if (fresh.ok) setBoard(fresh.board);
      }
      setPendingSlot(null);
    });
  };

  const xpPct = Math.min(100, Math.round((board.xp / Math.max(1, board.xpNext)) * 100));
  const selectedAv = selectedAvatar ? board.avatars.find((a) => a.id === selectedAvatar) ?? null : null;
  const previewBp = assignFor?.region && selectedAv ? enhanceBonusOf(weightedSumOf(selectedAv.equipment, assignFor.region)) : 0;

  /** 카드 탭 — 상태별 팝업/액션(카드에는 버튼이 없다, 2026-08-28 UI 개편). */
  const onCardTap = (s: ExpeditionBoardSlot) => {
    if (pendingSlot === s.slot) return;
    if (s.state === 'locked') {
      toast.showHeaderToast({ title: `합산 강화 ${(s.unlock?.enhanceSum ?? 0).toLocaleString('ko-KR')} 달성 시 열려요` });
      return;
    }
    if (s.state === 'offer') {
      setAssignSlot(s.slot);
      setSelectedAvatar(null); // 기본 미선택(2026-08-28) — 아바타를 직접 고르게
      return;
    }
    // 오늘 완료(슬롯당 하루 1회, 2026-09-01) — 공용 헤더 토스트로만 안내.
    if (s.state === 'done') {
      toast.showHeaderToast({ title: '내일 다시 보낼 수 있어요' });
      return;
    }
    // 파견 중 카드는 정보만(취소 기능 없음, 2026-08-28) — 귀환 완료면 수령, 아니면 남은 시간 토스트.
    const remain = s.completeAtIso ? Date.parse(s.completeAtIso) - nowMs() : 0;
    if (remain <= 0) doClaim(s);
    else toast.showHeaderToast({ title: `파견 완료까지 ${fmtRemain(remain)} 남음` });
  };

  return (
    <div className="space-y-2.5">
      {/* 헤더(H1, 2026-08-28) — 한 줄: Lv 알약(탭→레벨별 확률 표 팝업) · 대성공 · 새로고침 버튼 + XP 바. 합산 강화 칩은 제거(잠금 카드에 표시). */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setLevelInfo(true)}
          className="flex h-8 items-center gap-1 rounded-full border border-zinc-300 bg-white px-3 text-[11.5px] text-zinc-600 active:scale-95 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          파견 <b className="text-zinc-900 dark:text-zinc-50">Lv.{board.level}</b>
          <span className="ml-0.5 text-zinc-400">›</span>
        </button>
        <span className="h-3.5 w-px bg-zinc-300 dark:bg-zinc-700" />
        <span className="text-[11.5px] text-zinc-500 dark:text-zinc-400">
          대성공 <b className="text-amber-600 dark:text-amber-400">{(board.critBp / 100).toFixed(1)}%</b>
        </span>
        <span className="h-3.5 w-px bg-zinc-300 dark:bg-zinc-700" />
        {/* 오늘 파견 N/M(슬롯당 하루 1회, 2026-09-01) — N = 열린 슬롯 − 아직 보낼 수 있는(오퍼) 슬롯. 남았으면 강조색. */}
        {(() => {
          const open = board.slots.filter((x) => x.state !== 'locked').length;
          // 보낸 기준(2026-08-31) — 오늘(KST) 출발한 슬롯 수. 어제 출발해 아직 진행 중인 슬롯은 오늘 미출발로 센다.
          const sent = board.slots.filter((x) => x.state === 'done' || ((x.state === 'running') && x.startedToday)).length;
          return (
            <span className="text-[11.5px] text-zinc-500 dark:text-zinc-400">
              오늘 <b className={sent < open ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-zinc-50'}>{sent}/{open}</b>
            </span>
          );
        })()}
        <button
          type="button"
          onClick={() => setRefreshAsk(true)}
          disabled={pendingSlot !== null || !board.slots.some((x) => x.state === 'offer')}
          className="ml-auto h-8 rounded-xl border border-amber-300 bg-amber-50 px-3 text-[10.5px] font-bold text-amber-800 active:scale-95 disabled:opacity-40 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
        >
          새로고침 <b>{board.freeRefreshLeft > 0 ? `무료 ${board.freeRefreshLeft}회` : `💎${board.refreshCost}`}</b>
        </button>
      </div>
      <div className="flex items-center gap-2 px-0.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${xpPct}%` }} />
        </div>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">다음 레벨 {Math.max(0, board.xpNext - board.xp)} XP</span>
      </div>

      {/* 슬롯 — 카드 전체가 탭 대상 */}
      {board.slots.map((s) => (
        <SlotCard key={s.slot} s={s} pending={pendingSlot === s.slot} refreshing={refreshing} enhanceSum={board.enhanceSum} onTap={() => onCardTap(s)} />
      ))}

      {/* 원정대원 선택 — 미니 카드(선택 대원 기준 확정 보상) + 아바타 그리드 + [닫기 · 다른 미션 · 파견 보내기] */}
      {assignFor?.region ? (
        <ModalShell onClose={() => setAssignSlot(null)} label="아바타 선택">
          <ModalLayout
            title="아바타 선택"
            subtitle={
              <>
                <span style={{ color: REGION_UI[assignFor.region].color }}>{REGION_UI[assignFor.region].label}</span> · {HOUR_MOON[assignFor.hours ?? 0] ?? ''} {assignFor.hours}시간 · +{assignFor.reward?.xp ?? expeditionXpForHours(assignFor.hours ?? 0)} XP
              </>
            }
            bodyPad="sm"
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setAssignSlot(null)}>
                  닫기
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
              reward={assignFor.reward ? previewFinal(assignFor.reward, previewBp) : undefined}
              status={!assignFor.reward ? '새 파견 찾는 중…' : selectedAv ? '선택 아바타 기준 확정 보상' : '아바타를 선택하세요'}
              bonusText={selectedAv ? `×${(1 + previewBp / 10000).toFixed(2)}` : null}
              progress={0}
              compact
              hideHeader
            />
            {/* V1 아코디언(2026-08-28) — 최종 배율 높은 순(파견 중은 맨 아래), 선택 행 아래에 장비 3종·계산식 펼침.
                목록은 고정 높이 내부 스크롤이라 펼침이 팝업 높이를 바꾸지 않는다(시프트 0). */}
            <div className="mt-2 h-[236px] overflow-y-auto rounded-xl border border-zinc-100 p-1 dark:border-zinc-800/60">
              <div className="flex flex-col gap-1">
                {[...board.avatars]
                  .map((a) => {
                    const ws = weightedSumOf(a.equipment, assignFor.region!);
                    return { a, ws, mult: 1 + enhanceBonusOf(ws) / 10000 };
                  })
                  .sort((x, y) => Number(x.a.busy) - Number(y.a.busy) || y.mult - x.mult)
                  .map(({ a, ws, mult }) => {
                    const sel = selectedAvatar === a.id;
                    return (
                      <div
                        key={a.id}
                        className={`rounded-xl border transition ${sel ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-200 dark:border-zinc-800'} ${a.busy ? 'opacity-40' : ''}`}
                      >
                        <button
                          type="button"
                          disabled={a.busy}
                          onClick={() => setSelectedAvatar(sel ? null : a.id)}
                          className="flex h-[50px] w-full items-center gap-2.5 px-2.5 text-left"
                        >
                          <span className="flex h-10 w-8 flex-none items-end justify-center">
                            {a.south ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={a.south} alt="" decoding="async" className="h-10 w-auto" style={{ imageRendering: 'pixelated' }} />
                            ) : null}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col leading-tight">
                            {a.busy ? <b className="truncate text-[12px] text-zinc-800 dark:text-zinc-50">파견 중</b> : null}
                            <span className="truncate text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                              강화 합 {a.enhanceSum}{ws !== a.enhanceSum ? ` · 시너지 적용 ${ws}` : ''}
                            </span>
                          </span>
                          <b className="text-[13px] font-extrabold text-sky-600 dark:text-sky-400">×{mult.toFixed(2)}</b>
                        </button>
                        {sel ? (
                          <div className="mx-1.5 mb-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950">
                            {a.equipment.map((e) => {
                              const w = e.region === assignFor.region ? EXPEDITION_SYNERGY_MATCH_MULT : e.region === 'general' ? EXPEDITION_SYNERGY_GENERAL_MULT : 1;
                              const bonus = `+${Math.round((w - 1) * 100)}%`;
                              const rc = e.region && e.region !== 'general' ? REGION_UI[e.region] : null;
                              return (
                                <div key={e.key} className="grid h-5 grid-cols-[30px_1fr_auto_34px_52px] items-center gap-1.5 text-[10.5px]">
                                  <span className="text-[9.5px] text-zinc-400">{SLOT_KO[e.slot]}</span>
                                  <span className="truncate font-semibold text-zinc-700 dark:text-zinc-200">{e.name}</span>
                                  <span
                                    className="rounded border px-1 text-[9px] font-black"
                                    style={rc ? { color: rc.color, borderColor: `${rc.color}55` } : { color: '#a1a1aa', borderColor: '#a1a1aa55' }}
                                  >
                                    {rc ? rc.label : e.region === 'general' ? '일반' : '—'}
                                  </span>
                                  <b className="text-right text-[11px] text-zinc-800 dark:text-zinc-50">+{e.level}</b>
                                  <span className={`text-right text-[9px] font-extrabold ${w > 1 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400 dark:text-zinc-500'}`}>{bonus}</span>
                                </div>
                              );
                            })}
                            <div className={`flex justify-between text-[10px] text-zinc-500 dark:text-zinc-400 ${a.equipment.length > 0 ? 'mt-1 border-t border-zinc-200 pt-1 dark:border-zinc-800' : ''}`}>
                              <span>
                                강화 합 <b className="text-zinc-700 dark:text-zinc-200">{a.enhanceSum}</b>
                              </span>
                              <span>
                                시너지 적용 <b className="text-amber-600 dark:text-amber-400">{ws}</b>
                              </span>
                              <span>
                                배율 <b className="text-[12px] text-sky-600 dark:text-sky-400">×{mult.toFixed(2)}</b>
                              </span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            </div>
          </ModalLayout>
        </ModalShell>
      ) : null}


      {/* 레벨별 확률 표(H1) — 공시 상수(EXPEDITION_DIFFICULTY_DIST_BP·expeditionCritBp)와 1:1 */}
      {levelInfo ? (
        <ModalShell onClose={() => setLevelInfo(false)} label="파견 레벨">
          <ModalLayout
            title={`파견 Lv.${board.level}`}
            subtitle="레벨별 대성공 확률 · 파견 시간 출현 확률"
            bodyPad="sm"
            footer={
              <ModalButton tone="contrast" onClick={() => setLevelInfo(false)}>
                닫기
              </ModalButton>
            }
          >
            <table className="w-full border-collapse text-center text-[10.5px]">
              <thead>
                <tr className="text-zinc-400">
                  <th className="border-b border-zinc-200 py-1 text-left font-semibold dark:border-zinc-800">파견 레벨</th>
                  <th className="border-b border-zinc-200 py-1 font-semibold dark:border-zinc-800">대성공</th>
                  {EXPEDITION_DIFFICULTIES.map((d) => (
                    <th key={d} className="border-b border-zinc-200 py-1 font-semibold dark:border-zinc-800">
                      {HOUR_MOON[EXPEDITION_DIFFICULTY_HOURS[d]]} {EXPEDITION_DIFFICULTY_HOURS[d]}h
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LEVEL_BANDS.map((b) => {
                  const now = board.level >= b.min && board.level <= b.max;
                  return (
                    <tr key={b.min} className={now ? 'bg-amber-500/10 text-amber-700 dark:text-amber-200' : 'text-zinc-700 dark:text-zinc-300'}>
                      <td className="py-1.5 text-left font-bold">
                        {b.max >= EXPEDITION_LEVEL_MAX ? `${b.min}+` : `${b.min}~${b.max}`}
                        {now ? <span className="ml-1 text-[9px] font-extrabold text-amber-600 dark:text-amber-400">현재</span> : null}
                      </td>
                      <td className="py-1.5">
                        {(expeditionCritBp(b.min) / 100).toFixed(1)}~{(expeditionCritBp(b.max) / 100).toFixed(1)}%
                      </td>
                      {EXPEDITION_DIFFICULTIES.map((d) => (
                        <td key={d} className="py-1.5">
                          {Math.round(b.dist[d] / 100)}%
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* 난이도별 기본 보상 범위(2026-09-01) — 배율(아바타 강화 합·시너지) 적용 전, 시간 스케일 반영 값. 공시 표와 1:1. */}
            <table className="mt-3 w-full border-collapse text-center text-[10px]">
              <thead>
                <tr className="text-zinc-400">
                  <th className="border-b border-zinc-200 py-1 text-left font-semibold dark:border-zinc-800">기본 보상</th>
                  <th className="border-b border-zinc-200 py-1 font-semibold dark:border-zinc-800">상자만</th>
                  <th className="border-b border-zinc-200 py-1 font-semibold dark:border-zinc-800">다이아만</th>
                  <th className="border-b border-zinc-200 py-1 font-semibold dark:border-zinc-800">상자+다이아</th>
                  <th className="border-b border-zinc-200 py-1 font-semibold dark:border-zinc-800">XP</th>
                </tr>
              </thead>
              <tbody className="text-zinc-700 dark:text-zinc-300">
                {EXPEDITION_DIFFICULTIES.map((d) => {
                  const h = EXPEDITION_DIFFICULTY_HOURS[d] as 2 | 4 | 8 | 12;
                  const sc = EXPEDITION_DURATION_SCALE[h];
                  const f = (n: number) => Math.max(1, Math.round(n * sc));
                  const a = EXPEDITION_BASE_AMOUNTS;
                  const [x0, x1] = EXPEDITION_XP_RANGE_BY_HOURS[h];
                  return (
                    <tr key={d}>
                      <td className="py-1 text-left font-bold">{HOUR_MOON[h]} {h}h</td>
                      <td className="py-1">📦{f(a.boxOnly.boxMin)}~{f(a.boxOnly.boxMax)}</td>
                      <td className="py-1">💎{f(a.diamondOnly.diaMin)}~{f(a.diamondOnly.diaMax)}</td>
                      <td className="py-1">📦{f(a.both.boxMin)}~{f(a.both.boxMax)} + 💎{f(a.both.diaMin)}~{f(a.both.diaMax)}</td>
                      <td className="py-1">{x0}~{x1}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1 text-center text-[9.5px] text-zinc-400">배율(아바타 강화 합·지역 시너지) 적용 전 기본값 · 대성공 시 상자·다이아 2배</p>
            {/* 내 대성공 계산 한 줄 — 표는 레벨분만(2026-08-31). */}
            <p className="mt-2 text-center text-[10.5px] tabular-nums text-zinc-500 dark:text-zinc-400">
              파견 레벨 대성공 {(expeditionCritBp(board.level) / 100).toFixed(1)}% + 합산 강화 보너스{' '}
              {((board.critBp - expeditionCritBp(board.level)) / 100).toFixed(1)}% = 현재 대성공 확률{' '}
              <b className="text-amber-600 dark:text-amber-400">{(board.critBp / 100).toFixed(1)}%</b>
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}

      {/* 전체 새로고침 확인 */}
      {refreshAsk ? (
        <ModalShell onClose={() => setRefreshAsk(false)} label="파견 새로고침">
          <ModalLayout
            title="파견을 새로고침할까요?"
            subtitle={`무료 ${EXPEDITION_REFRESH_FREE_PER_DAY}회 이후 1회당 💎${board.refreshCost}`}
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setRefreshAsk(false)}>
                  닫기
                </ModalButton>
                <ModalButton tone="contrast" onClick={doRefreshAll}>
                  {board.freeRefreshLeft > 0 ? `새로고침 (무료 ${board.freeRefreshLeft}회)` : `💎 ${board.refreshCost} 사용`}
                </ModalButton>
              </>
            }
          >
            <p className="text-center text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              미배정 슬롯 {board.slots.filter((x) => x.state === 'offer').length}개의 파견이 모두 바뀝니다. 진행 중인 파견은 그대로예요.
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}

      {/* 수령 팝업(C3, 2026-08-28) — 부위별 상자 칸 + 💎 칸 + XP 칸이 순서대로 튀어나오며 숫자가 올라간다. 대성공은 서버 판정이라 응답 후 표시 */}
      {claimPopup ? (
        <ModalShell onClose={() => setClaimPopup(null)} label="파견 귀환">
          <ModalLayout
            title="파견 귀환"
            subtitle={
              <>
                <span style={{ color: REGION_UI[claimPopup.region].color }}>{REGION_UI[claimPopup.region].label}</span> · {claimPopup.hours}시간 원정대가 돌아왔습니다
              </>
            }
            bodyPad="sm"
            footer={
              <ModalButton tone="contrast" onClick={() => setClaimPopup(null)}>
                확인
              </ModalButton>
            }
          >
            <ClaimItems popup={claimPopup} />
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
  if (!r) return '';
  const parts: string[] = [];
  if (r.boxes) {
    const t = r.boxes.weapon + r.boxes.armor + r.boxes.accessory;
    if (t > 0) parts.push(`📦 ${t}`);
  }
  if (r.diamond) parts.push(`💎 ${r.diamond.toLocaleString('ko-KR')}`);
  return parts.join(' + ');
}

/** 이벤트 핸들러 전용 현재 시각(서버 시계 보정) — 렌더 경로에서 호출 금지(React 컴파일러 순수성 규칙). */
const nowMs = () => serverNow();

const SLOT_KO: Record<'weapon' | 'armor' | 'accessory', string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

/** 시간 → 몬스터 단계(t1~t4). */
const MON_TIER: Record<number, number> = { 2: 1, 4: 2, 8: 3, 12: 4, 24: 4 };
/** 미배정 실루엣 — 기본 남 스프라이트(흑백·30%). */
const GHOST_SRC = '/sprites/default/male/south.png';
/** 글자 스트로크(R2) — 밝은 배경에서도 흰 글자 대비 유지. */
const STROKE: React.CSSProperties = { textShadow: '0 0 3px #000, 0 0 6px #000, 0 1px 2px #000' };

/**
 * 카드 본문(2026-08-28 UI 개편 v12) — 112px. 헤더 24(중앙 지역명 · 시간 칩). 좌·우 열은 절대 배치로 카드 전체
 * 높이를 쓴다(헤더 침범 허용): 첫 24px에 배율(×1.55)/XP 텍스트를 헤더 라인에 맞추고, 아래 공간에 전신 아바타
 * 86px / 몬스터 62px. 중앙: 보상 크게(19px, 카드 정중앙) + "완료까지 N시간 N분 N초"(흰색 10px, 조금 아래).
 * 전부 고정 높이 — 상태 전환 시 시프트 0. 하단 보더 진행 게이지(강화 문법). 취소 기능 없음.
 */
function CardBody({
  region,
  hours,
  avatarSouth,
  reward,
  status,
  statusCls,
  bonusText,
  progress,
  compact,
  hideHeader,
  mutedBg,
  mutedMon,
  mutedAvatar,
  glow,
  children,
}: {
  region: ExpeditionRegion;
  hours: number;
  avatarSouth: string | null;
  reward: ExpeditionReward | undefined;
  /** 중앙 하단 작은 상태 — '파견 대기' / 타이머 / '파견 완료'. */
  status: React.ReactNode;
  statusCls?: string;
  /** 아바타 위 배지("×1.55") — null이면 자리만 유지(미배정). */
  bonusText: string | null;
  /** 하단 보더 진행 게이지 0~1(미배정 0). 강화 카드 문법: <50% 빨강 · 50~ 주황 · 100% 초록. */
  progress: number;
  compact?: boolean;
  /** 헤더(지역명·시간) 숨김 — 팝업 미니 카드(정보는 팝업 부제에 있음). */
  hideHeader?: boolean;
  /** 흑백 처리 — 미배정: 배경+몬스터, 완료: 몬스터만(배경은 컬러). 진행 중 카드에 구분감(2026-08-28). */
  mutedBg?: boolean;
  mutedMon?: boolean;
  /** 아바타 흑백 — 오늘 완료 카드(배경·아바타·몬스터 전부 흑백, 2026-08-31). */
  mutedAvatar?: boolean;
  glow?: boolean;
  children?: React.ReactNode;
}) {
  const ui = REGION_UI[region];
  void bonusText; // 카드 배지 삭제(2026-08-28) — 배율은 팝업에서만
  const avH = compact ? 64 : 86;
  const monH = compact ? 56 : 72; // 62→72(2026-08-30 스테이징 검수: 실기기에서 작아 보임)
  const gaugeCls = progress >= 1 ? 'bg-emerald-400' : progress >= 0.5 ? 'bg-orange-400' : 'bg-red-500';
  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${compact ? 'h-[104px]' : 'h-[112px]'} ${
        glow ? 'border-emerald-400/70' : 'border-zinc-800'
      }`}
    >
      {/* 배경 — muted면 흑백(아바타·텍스트는 컬러 유지) */}
      <div
        className={`pointer-events-none absolute inset-0 bg-cover bg-center ${mutedBg ? 'grayscale' : ''}`}
        style={{ backgroundImage: `url(${assetUrl(`/sprites/expedition/bg/${region}.png`)})` }}
      />
      {/* 가독성(R2, 2026-08-28) — 전면 50% 어둡게 + 상·하 그라데이션 진하게 + 글자 2중 그림자(스트로크) */}
      <div className="pointer-events-none absolute inset-0 bg-black/50" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/85 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/85 to-transparent" />
      {/* 헤더 24px — 중앙 지역명 · 시간 칩(v12 롤백) */}
      {/* 헤더 — 지역명·시간 중심 y=20 (보상 56 · 상태 92와 등간격 36px, v14) */}
      {hideHeader ? null : (
        <div className="relative flex h-10 items-center justify-center gap-2 px-2.5">
          <span className="text-[10px] font-extrabold text-white" style={STROKE}>
            {HOUR_MOON[hours] ?? '🌑'} {hours}시간
          </span>
          <b className="truncate text-[12.5px] font-black" style={{ color: ui.color, ...STROKE }}>
            {ui.label}
          </b>
          <span className="text-[10px] font-extrabold text-zinc-200" style={STROKE}>
            +{reward?.xp ?? expeditionXpForHours(hours)} XP
          </span>
        </div>
      )}
      {/* 좌·우 열은 카드 전체 높이(헤더 침범 허용) — 배지 줄(24px)을 헤더 라인에 맞추고 그 아래 스프라이트를 크게 */}
      <span className={`absolute inset-y-0 left-2.5 flex flex-col items-center ${compact ? 'w-16' : 'w-[86px]'}`}>
        {hideHeader ? null : <span className="h-6" />}
        <span className={`flex flex-1 items-center justify-center ${hideHeader ? '' : 'pb-2'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarSouth ?? GHOST_SRC}
            alt=""
            decoding="async"
            className={avatarSouth ? `drop-shadow-[0_2px_2px_rgba(0,0,0,.8)]${mutedAvatar ? ' grayscale' : ''}` : 'opacity-30 grayscale brightness-150'}
            style={{ height: avH, width: 'auto', imageRendering: 'pixelated' }}
          />
        </span>
      </span>
      <span className={`absolute inset-y-0 right-2.5 flex flex-col items-center ${compact ? 'w-16' : 'w-[86px]'}`}>
        {hideHeader ? null : <span className="h-6" />}
        <span className={`flex flex-1 items-center justify-center ${hideHeader ? '' : 'pb-2'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetUrl(`/sprites/expedition/mon/${region}-t${MON_TIER[hours] ?? 1}.png`)}
            alt=""
            decoding="async"
            className={`drop-shadow-[0_2px_2px_rgba(0,0,0,.8)] ${mutedMon ? 'grayscale' : ''}`}
            style={{ height: monH, width: 'auto', imageRendering: 'pixelated' }} // 스프라이트 파일이 이미 왼쪽(아바타 쪽)을 본다 — CSS 반전 제거(2026-08-30)
          />
        </span>
      </span>
      {/* 중앙 — 카드 전체 기준 정중앙: 블록(보상 28 + 간격 4 + 상태 16 = 48)을 카드에 수직 중앙 정렬하고
          상단 패딩 20으로 보상 줄 중심(=14+20)이 블록 중심(=34)에 오게 → 보상이 정확히 카드 세로 중앙. */}
      <div className={`absolute inset-y-0 text-center ${compact ? 'left-[74px] right-[74px]' : 'left-[96px] right-[96px]'}`}>
        {/* 보상 중심 = 카드 세로 정중앙(112→56 / compact 104→52), 상태 중심 = +36px */}
        <span className={`absolute inset-x-0 block h-7 truncate text-[19px] font-black leading-7 text-white ${compact ? 'top-[38px]' : 'top-[42px]'}`} style={STROKE}>{rewardShort(reward)}</span>
        <span className={`absolute inset-x-0 block h-4 truncate text-[10px] font-bold leading-4 ${compact ? 'top-[74px]' : 'top-[84px]'} ${statusCls ?? 'text-white'}`} style={STROKE}>{status}</span>
      </div>
      {/* 하단 보더 진행 게이지(강화 카드 문법) */}
      {progress > 0 ? (
        <div className={`absolute bottom-0 left-0 h-1 ${gaugeCls}`} style={{ width: `${Math.max(2, Math.round(progress * 1000) / 10)}%` }} />
      ) : null}
      {children}
    </div>
  );
}

/** 숫자 카운트업(0.6s, easeOut) — prefers-reduced-motion이면 즉시 최종값. */
const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function useCountUp(target: number, delayMs: number): number {
  const [v, setV] = useState(() => (prefersReducedMotion() ? target : 0));
  const fromRef = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion()) { const t = setTimeout(() => setV(target), 0); return () => clearTimeout(t); }
    let raf = 0;
    let start = 0;
    const dur = 600;
    const from = fromRef.current; // 목표가 바뀌면(대성공 2배 공개) 0이 아니라 현재 값에서 이어서 올라간다
    const t0 = setTimeout(() => {
      const step = (t: number) => {
        if (!start) start = t;
        const k = Math.min(1, (t - start) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        const nv = Math.round(from + (target - from) * e);
        fromRef.current = nv;
        setV(nv);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delayMs);
    return () => {
      clearTimeout(t0);
      cancelAnimationFrame(raf);
    };
  }, [target, delayMs]);
  return v;
}

function ClaimCell({ icon, value, label, delayMs, gold, dim, prefix = '×', bump }: { icon: string; value: number; label: string; delayMs: number; gold?: boolean; dim?: boolean; prefix?: string; bump?: boolean }) {
  const n = useCountUp(value, delayMs);
  return (
    <div
      className={`exp-pop flex h-[78px] flex-col items-center justify-center gap-0.5 rounded-xl border ${
        gold || bump ? 'border-amber-400/70 bg-amber-500/10' : dim ? 'border-zinc-200 dark:border-zinc-800' : 'border-sky-400/60 bg-sky-500/5 dark:border-sky-400/50'
      } ${dim ? 'opacity-40 grayscale' : ''} ${bump ? 'exp-bump' : ''}`}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span className={`text-[20px] leading-none ${gold ? 'text-amber-400' : ''}`}>{icon}</span>
      <b className={`whitespace-nowrap text-[13px] tabular-nums leading-tight ${gold ? 'text-amber-600 dark:text-amber-300' : 'text-zinc-900 dark:text-zinc-50'}`}>
        {prefix}{n.toLocaleString('ko-KR')}
      </b>
      <span className={`text-[9.5px] leading-tight ${gold ? 'font-bold text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}>{label}</span>
    </div>
  );
}

/** 대성공 공개 전 표시용 — 최종 보상을 배수로 나눈 '일반 획득' 수량. */
function halfReward(r: ExpeditionReward): ExpeditionReward {
  const h = (v: number | undefined) => (v == null ? v : Math.round(v / EXPEDITION_CRIT_MULT));
  return { ...r, diamond: h(r.diamond), boxes: r.boxes ? { weapon: h(r.boxes.weapon) ?? 0, armor: h(r.boxes.armor) ?? 0, accessory: h(r.boxes.accessory) ?? 0 } : r.boxes };
}
/** C3 — 항상 5칸(💎 · 📦무기 · 📦방어구 · 📦장신구 · ✦XP), 미획득은 ×0(흐리게). 하단에 '기본 × 배율(× 대성공)' 계산줄. */
function ClaimItems({ popup }: { popup: ClaimPopup }) {
  // 대성공 2단 공개(2026-08-30) — 먼저 일반 획득량(최종의 절반)이 올라가고, 잠시 뒤 황금 섬광과 함께
  // 칸이 튀며 수량이 2배로 이어서 올라간다(도장 라벨은 2026-08-30 삭제). 대성공이 아니면 1단만.
  const [revealed, setRevealed] = useState(!popup.crit || prefersReducedMotion());
  useEffect(() => {
    if (!popup.crit || prefersReducedMotion()) return;
    const t = setTimeout(() => setRevealed(true), 1250);
    return () => clearTimeout(t);
  }, [popup.crit]);
  const b = popup.reward.boxes;
  const half = (v: number) => (popup.crit && !revealed ? Math.round(v / EXPEDITION_CRIT_MULT) : v);
  const cells: { icon: string; value: number; label: string; gold?: boolean; prefix?: string; bump?: boolean }[] = [
    { icon: '💎', value: half(popup.reward.diamond ?? 0), label: '다이아', prefix: '', bump: popup.crit && revealed && (popup.reward.diamond ?? 0) > 0 },
    { icon: '⚔️', value: half(b?.weapon ?? 0), label: '무기', bump: popup.crit && revealed && (b?.weapon ?? 0) > 0 },
    { icon: '🛡️', value: half(b?.armor ?? 0), label: '방어구', bump: popup.crit && revealed && (b?.armor ?? 0) > 0 },
    { icon: '💍', value: half(b?.accessory ?? 0), label: '장신구', bump: popup.crit && revealed && (b?.accessory ?? 0) > 0 },
    { icon: '✦', value: popup.xpGained, label: popup.levelUp ? `Lv.${popup.level} 달성!` : `파견 Lv.${popup.level}`, gold: popup.levelUp, prefix: '+' },
  ];
  const base = popup.baseReward ? rewardShort(popup.baseReward) : null;
  return (
    <div>
      <style>{`@keyframes exp-pop{0%{opacity:0;transform:scale(.6) translateY(6px)}60%{opacity:1;transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}.exp-pop{opacity:0;animation:exp-pop .42s cubic-bezier(.2,.9,.3,1.2) forwards}
@keyframes exp-bump{0%{transform:scale(1)}35%{transform:scale(1.14)}100%{transform:scale(1)}}.exp-bump{animation:exp-pop .42s cubic-bezier(.2,.9,.3,1.2) forwards,exp-bump .5s ease-out .05s;box-shadow:0 0 0 1px rgba(251,191,36,.6),0 0 14px rgba(251,191,36,.45)}
@keyframes exp-flash{0%{opacity:0}18%{opacity:1}100%{opacity:0}}.exp-flash{animation:exp-flash .9s ease-out forwards}
@keyframes exp-stamp{0%{opacity:0;transform:scale(2.2) rotate(-8deg)}55%{opacity:1;transform:scale(.92) rotate(-8deg)}100%{opacity:1;transform:scale(1) rotate(-8deg)}}.exp-stamp{animation:exp-stamp .45s cubic-bezier(.2,.9,.3,1.3) forwards}
@media(prefers-reduced-motion:reduce){.exp-pop,.exp-bump,.exp-stamp{opacity:1;animation:none}.exp-flash{display:none}}`}</style>
      <div className="relative">
        <div className="grid grid-cols-5 gap-1.5">
          {cells.map((c, i) => (
            <ClaimCell key={c.label} icon={c.icon} value={c.value} label={c.label} delayMs={revealed && popup.crit ? 0 : 120 + i * 110} gold={c.gold} prefix={c.prefix} dim={c.value === 0} bump={c.bump} />
          ))}
        </div>
        {popup.crit && revealed ? (
          <>
            <div className="exp-flash pointer-events-none absolute -inset-3 rounded-2xl" style={{ background: 'radial-gradient(ellipse at center, rgba(253,224,71,.55), rgba(251,191,36,.18) 55%, transparent 75%)' }} />
          </>
        ) : null}
      </div>
      {/* 계산줄 — '기본값 × 배율 (× 2) = 보상'. 대성공 안내는 있을 때만 한 줄 추가(없으면 여백 없음). */}
      <div className="mt-2 flex flex-col items-center text-center leading-tight">
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          <b className="text-zinc-700 dark:text-zinc-200">{base ?? '—'}</b>
          {popup.bonusText ? <> × <b className="text-sky-600 dark:text-sky-400">{popup.bonusText.replace('×', '')}</b></> : null}
          {popup.crit && revealed ? <> × <b className="text-amber-600 dark:text-amber-400">{EXPEDITION_CRIT_MULT}</b></> : null}
          {' = '}<b className="text-zinc-900 dark:text-zinc-50">{popup.crit && !revealed && popup.baseReward ? rewardShort(halfReward(popup.reward)) : rewardShort(popup.reward)}</b>
        </span>
        {popup.crit && revealed ? <span className="mt-1 text-[10.5px] font-bold text-amber-600 dark:text-amber-400">대성공으로 보상이 {EXPEDITION_CRIT_MULT}배가 됐어요</span> : null}
      </div>
    </div>
  );
}

function SlotCard({ s, pending, refreshing, enhanceSum, onTap }: { s: ExpeditionBoardSlot; pending: boolean; refreshing?: boolean; enhanceSum: number; onTap: () => void }) {
  if (s.state === 'locked') {
    // 잠금 — 같은 128px, 흑백 + 점선. 좌 🔒 · 중앙 3줄(필요 수치 / 달성 시 오픈 / 현재) · 우 진행 바. 배지 없음.
    const need = s.unlock?.enhanceSum ?? 0;
    const pct = need > 0 ? Math.min(100, Math.floor((enhanceSum / need) * 100)) : 0;
    const bg = s.slot === 3 ? 'kingdom' : 'angel';
    return (
      <button
        type="button"
        onClick={onTap}
        className="relative block h-[112px] w-full overflow-hidden rounded-xl border border-dashed border-zinc-500 bg-cover bg-center text-left grayscale"
        style={{ backgroundImage: `url(${assetUrl(`/sprites/expedition/bg/${bg}.png`)})` }}
      >
        {/* dim 레이어 — 보더 영역까지 덮도록 -inset-px(2026-08-28) */}
        <div className="pointer-events-none absolute -inset-px rounded-xl bg-black/60" />
        <div className="relative flex h-6 items-center justify-center px-2.5">
          <b className="text-[12.5px] font-black text-white">슬롯 {s.slot}</b>
        </div>
        <div className="relative -mt-2.5 flex h-[88px] items-center justify-between px-2.5">
          <span className="flex w-[86px] justify-center text-[22px]">🔒</span>
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center text-center">
            <b className="block h-6 text-[15px] font-black leading-6 text-white">{need.toLocaleString('ko-KR')}</b>
            <span className="block h-4 text-[11px] font-extrabold leading-4 text-zinc-100">합산 강화 달성 시 오픈</span>
            <span className="block h-3.5 text-[9.5px] font-bold leading-[14px] text-zinc-300">현재 {enhanceSum.toLocaleString('ko-KR')}</span>
          </div>
          <div className="flex w-[86px] flex-col items-center gap-1">
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
      {s.state === 'done' ? (
        // 오늘 완료(2026-09-01) — 수령한 파견 정보(아바타·받은 보상)를 그대로 두고 리본 + 문구만 얹는다.
        <CardBody region={region} hours={hours} avatarSouth={s.avatarSouth ?? null} reward={s.reward} status="내일 다시 보낼 수 있어요" statusCls="text-amber-300" bonusText={null} progress={0} mutedBg mutedMon mutedAvatar>
          <div className="pointer-events-none absolute -right-7 top-3 rotate-[38deg] bg-amber-500 px-8 py-0.5 text-[9.5px] font-black text-black shadow-[0_1px_3px_rgba(0,0,0,.6)]">오늘 완료</div>
        </CardBody>
      ) : s.state === 'offer' ? (
        <CardBody region={region} hours={hours} avatarSouth={null} reward={s.reward} status={refreshing || !s.reward ? '새 파견 찾는 중…' : '파견 대기'} bonusText={null} progress={0} mutedBg mutedMon />
      ) : (
        <Ticker>
          {(now) => {
            const remain = s.completeAtIso ? Date.parse(s.completeAtIso) - (now + clockOffsetMs()) : 0; // 서버 시계 보정
            const done = remain <= 0;
            const total = Math.max(1, hours * 3_600_000);
            const progress = done ? 1 : Math.min(0.999, Math.max(0, 1 - remain / total));
            return (
              <CardBody
                region={region}
                hours={hours}
                avatarSouth={s.avatarSouth ?? null}
                reward={s.reward}
                status={done ? '파견 완료' : <span className="tabular-nums">파견 완료까지 {fmtRemain(remain)}</span>}
                statusCls={done ? 'text-emerald-400' : 'text-white'}
                bonusText={`×${(1 + bonus / 10000).toFixed(2)}`}
                progress={progress}
                glow={done}
              />
            );
          }}
        </Ticker>
      )}
    </button>
  );
}
