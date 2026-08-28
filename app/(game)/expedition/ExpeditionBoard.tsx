'use client';

import { useCallback, useState, useTransition } from 'react';

import { ModalShell } from '@/components/ModalShell';
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
  expeditionCritBp, } from '@/lib/game/balance';
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
const HOUR_MOON: Record<number, string> = { 4: '🌘', 8: '🌗', 12: '🌖', 24: '🌕' };

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

/** 클라 가중 강화 합 미리보기 — 서버(engine.avatarWeightedSum)와 동일 산식(표시 전용, 권위는 서버). */
function weightedSumOf(equipment: ExpeditionAvatar['equipment'], mission: ExpeditionRegion): number {
  return expeditionWeightedSum(equipment.map((e) => ({ level: e.level, region: e.region })), mission);
}

type ClaimPopup = { crit: boolean; reward: ExpeditionReward; xpGained: number; level: number; levelUp: boolean; region: ExpeditionRegion; hours: number; avatarSouth: string | null; bonusText: string | null };

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
          hours: s.hours ?? 0, avatarSouth: s.avatarSouth ?? null,
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
    // 파견 중 카드는 정보만(취소 기능 없음, 2026-08-28) — 귀환 완료면 수령.
    const done = s.completeAtIso ? Date.parse(s.completeAtIso) <= nowMs() : false;
    if (done) doClaim(s);
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
                <span style={{ color: REGION_UI[assignFor.region].color }}>{REGION_UI[assignFor.region].label}</span> · {assignFor.hours}시간
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
            <p className="mt-2 text-center text-[10.5px] text-zinc-500 dark:text-zinc-400">
              대성공은 보상을 {EXPEDITION_CRIT_MULT}배 지급합니다. 긴 파견일수록 보상이 큽니다.
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

      {/* 수령 팝업(E2, 2026-08-28) — 귀환 미니 카드(같은 그림) + 보상·XP 2칸. 대성공은 서버 판정이라 응답 후 표시 */}
      {claimPopup ? (
        <ModalShell onClose={() => setClaimPopup(null)} label="파견 귀환">
          <ModalLayout
            title={claimPopup.crit ? '✨ 대성공!' : '파견 귀환'}
            subtitle={
              <>
                <span style={{ color: REGION_UI[claimPopup.region].color }}>{REGION_UI[claimPopup.region].label}</span> 원정대가 돌아왔습니다
              </>
            }
            bodyPad="sm"
            footer={
              <ModalButton tone="contrast" onClick={() => setClaimPopup(null)}>
                확인
              </ModalButton>
            }
          >
            <CardBody
              region={claimPopup.region}
              hours={claimPopup.hours}
              avatarSouth={claimPopup.avatarSouth}
              reward={claimPopup.reward}
              status={claimPopup.crit ? '대성공 · 보상 2배' : '파견 완료'}
              statusCls={claimPopup.crit ? 'text-amber-300' : 'text-emerald-400'}
              bonusText={claimPopup.bonusText}
              progress={1}
              compact
              hideHeader
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="flex h-[58px] flex-col items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800">
                <b className="text-[17px] text-zinc-900 dark:text-zinc-50">{rewardShort(claimPopup.reward) || '—'}</b>
                <span className="h-4 text-[10px] text-zinc-500 dark:text-zinc-400">{claimPopup.reward.boxes ? boxDetail(claimPopup.reward) : '다이아 지급'}</span>
              </div>
              <div className="flex h-[58px] flex-col items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800">
                <b className="text-[17px] text-zinc-900 dark:text-zinc-50">+{claimPopup.xpGained} XP</b>
                <span className={`h-4 text-[10px] ${claimPopup.levelUp ? 'font-bold text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                  {claimPopup.levelUp ? `파견 Lv.${claimPopup.level} 달성!` : `파견 Lv.${claimPopup.level}`}
                </span>
              </div>
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
const MON_TIER: Record<number, number> = { 4: 1, 8: 2, 12: 3, 24: 4 };
/** 미배정 실루엣 — 기본 남 스프라이트(흑백·30%). */
const GHOST_SRC = '/sprites/default/male/south.png';

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
  glow?: boolean;
  children?: React.ReactNode;
}) {
  const ui = REGION_UI[region];
  const avH = compact ? 64 : 86;
  const monH = compact ? 48 : 62;
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
        style={{ backgroundImage: `url(/sprites/expedition/bg/${region}.png)` }}
      />
      {/* 가독성 — 전면 35% 어둡게 + 상·하 그라데이션 */}
      <div className="pointer-events-none absolute inset-0 bg-black/35" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-9 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/70 to-transparent" />
      {/* 헤더 24px — 중앙 지역명 · 시간 칩(v12 롤백) */}
      {/* 헤더 — 지역명·시간 중심 y=20 (보상 56 · 상태 92와 등간격 36px, v14) */}
      {hideHeader ? null : (
        <div className="relative flex h-10 items-center justify-center gap-1.5 px-2.5">
          <b className="truncate text-[12.5px] font-black drop-shadow" style={{ color: ui.color }}>
            {ui.label}
          </b>
          <span className="text-[10px] font-extrabold text-white drop-shadow">
            {HOUR_MOON[hours] ?? '🌑'} {hours}시간
          </span>
        </div>
      )}
      {/* 좌·우 열은 카드 전체 높이(헤더 침범 허용) — 배지 줄(24px)을 헤더 라인에 맞추고 그 아래 스프라이트를 크게 */}
      <span className={`absolute inset-y-0 left-2.5 flex flex-col items-center ${compact ? 'w-16' : 'w-[86px]'}`}>
        <span className={`flex h-6 items-center text-[10px] font-black text-sky-300 drop-shadow ${bonusText ? '' : 'invisible'}`}>{bonusText ?? '—'}</span>
        <span className="flex flex-1 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarSouth ?? GHOST_SRC}
            alt=""
            decoding="async"
            className={avatarSouth ? 'drop-shadow-[0_2px_2px_rgba(0,0,0,.8)]' : 'opacity-30 grayscale brightness-150'}
            style={{ height: avH, width: 'auto', imageRendering: 'pixelated' }}
          />
        </span>
      </span>
      <span className={`absolute inset-y-0 right-2.5 flex flex-col items-center ${compact ? 'w-16' : 'w-[86px]'}`}>
        <span className="flex h-6 items-center text-[10px] font-black text-zinc-200 drop-shadow">+{hours} XP</span>
        <span className="flex flex-1 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/sprites/expedition/mon/${region}-t${MON_TIER[hours] ?? 1}.png`}
            alt=""
            decoding="async"
            className={`drop-shadow-[0_2px_2px_rgba(0,0,0,.8)] ${mutedMon ? 'grayscale' : ''}`}
            style={{ height: monH, width: 'auto', imageRendering: 'pixelated', transform: 'scaleX(-1)' }}
          />
        </span>
      </span>
      {/* 중앙 — 카드 전체 기준 정중앙: 블록(보상 28 + 간격 4 + 상태 16 = 48)을 카드에 수직 중앙 정렬하고
          상단 패딩 20으로 보상 줄 중심(=14+20)이 블록 중심(=34)에 오게 → 보상이 정확히 카드 세로 중앙. */}
      <div className={`absolute inset-y-0 text-center ${compact ? 'left-[74px] right-[74px]' : 'left-[96px] right-[96px]'}`}>
        {/* 보상 중심 = 카드 세로 정중앙(112→56 / compact 104→52), 상태 중심 = +36px */}
        <span className={`absolute inset-x-0 block h-7 truncate text-[19px] font-black leading-7 text-white drop-shadow ${compact ? 'top-[38px]' : 'top-[42px]'}`}>{rewardShort(reward)}</span>
        <span className={`absolute inset-x-0 block h-4 truncate text-[10px] font-bold leading-4 drop-shadow ${compact ? 'top-[74px]' : 'top-[84px]'} ${statusCls ?? 'text-white'}`}>{status}</span>
      </div>
      {/* 하단 보더 진행 게이지(강화 카드 문법) */}
      {progress > 0 ? (
        <div className={`absolute bottom-0 left-0 h-1 ${gaugeCls}`} style={{ width: `${Math.max(2, Math.round(progress * 1000) / 10)}%` }} />
      ) : null}
      {children}
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
        style={{ backgroundImage: `url(/sprites/expedition/bg/${bg}.png)` }}
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
      {s.state === 'offer' ? (
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
                mutedMon={done}
              />
            );
          }}
        </Ticker>
      )}
    </button>
  );
}
