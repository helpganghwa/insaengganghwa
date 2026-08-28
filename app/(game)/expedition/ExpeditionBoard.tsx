'use client';

import { useCallback, useState, useTransition } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { useResourceToast } from '@/components/ResourceToast';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { Ticker } from '@/components/Ticker';
import { useDiamondActions } from '@/components/DiamondContext';
import { useDiamondGate } from '@/components/DiamondGate';
import {
  EXPEDITION_REFRESH_FREE_PER_DAY,
  EXPEDITION_SYNERGY_GENERAL_BP,
  EXPEDITION_SYNERGY_MATCH_BP,
  type ExpeditionRegion, expeditionAsBonusBp } from '@/lib/game/balance';
import type { ExpeditionBoard, ExpeditionBoardSlot } from '@/lib/game/expedition/queries';
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


  const doClaim = (s: ExpeditionBoardSlot) => {
    // 낙관적(2026-08-28): 탭 즉시 ① 다이아 선반영(비크리 기준) ② 슬롯을 '새 미션 찾는 중' 오퍼로 비움
    // ③ 아바타 잠금 해제. 대성공은 서버 롤이라 팝업만 응답 후 — 실패 시 전부 역보정 + 서버 보드 재동기.
    const preAdd = s.reward?.diamond ?? 0;
    if (preAdd > 0) optimisticAdjust(BigInt(preAdd));
    const prev = board;
    setBoard((b) => ({
      ...b,
      slots: b.slots.map((x) => (x.slot === s.slot ? { slot: s.slot, state: 'offer' as const, reward: undefined } : x)),
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
        setClaimPopup({ crit: r.crit, reward: r.reward, xpGained: r.xpGained, level: r.level, levelUp: r.levelUp, region: s.region! });
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
  const previewBp =
    assignFor?.region && selectedAv ? synergyOf(selectedAv.regions, assignFor.region) + enhanceBonusOf(selectedAv.enhanceSum) : 0;

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
      {/* 헤더 — 스탯 칩 4 + XP 바(2026-08-28 UI 개편) */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          ['Lv', String(board.level)],
          ['대성공', `${(board.critBp / 100).toFixed(1)}%`],
          ['합산 강화', board.enhanceSum.toLocaleString('ko-KR')],
        ].map(([k, v]) => (
          <div key={k} className="flex h-[46px] flex-col items-center justify-center rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60">
            <span className="text-[9px] text-zinc-400 dark:text-zinc-500">{k}</span>
            <b className="text-[13px] leading-tight text-zinc-800 dark:text-zinc-50">{v}</b>
          </div>
        ))}
        {/* 새로고침 — 미배정 슬롯 전체 리롤 버튼(진행 중 제외). 무료 잔여/비용 표기. */}
        <button
          type="button"
          onClick={() => setRefreshAsk(true)}
          disabled={pendingSlot !== null || !board.slots.some((x) => x.state === 'offer')}
          className="flex h-[46px] flex-col items-center justify-center rounded-xl border border-amber-300 bg-amber-50 active:scale-95 disabled:opacity-40 dark:border-amber-500/40 dark:bg-amber-500/10"
        >
          <span className="text-[9px] text-amber-700 dark:text-amber-300">새로고침</span>
          <b className="text-[13px] leading-tight text-amber-800 dark:text-amber-200">{board.freeRefreshLeft > 0 ? `무료 ${board.freeRefreshLeft}회` : `💎${board.refreshCost}`}</b>
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
                  .map((a) => ({ a, syn: synergyOf(a.regions, assignFor.region!), mult: 1 + (enhanceBonusOf(a.enhanceSum) + synergyOf(a.regions, assignFor.region!)) / 10000 }))
                  .sort((x, y) => Number(x.a.busy) - Number(y.a.busy) || y.mult - x.mult)
                  .map(({ a, syn, mult }) => {
                    const sel = selectedAvatar === a.id;
                    const asMult = 1 + enhanceBonusOf(a.enhanceSum) / 10000;
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
                              강화 합 {a.enhanceSum} · 시너지 +{syn / 100}%
                            </span>
                          </span>
                          <b className="text-[13px] font-extrabold text-sky-600 dark:text-sky-400">×{mult.toFixed(2)}</b>
                        </button>
                        {sel ? (
                          <div className="mx-1.5 mb-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950">
                            {a.equipment.map((e) => {
                              const bonus = e.region === assignFor.region ? '일치 +10%' : e.region === 'general' ? '일반 +5%' : '';
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
                                  <span className="text-right text-[9px] font-extrabold text-amber-600 dark:text-amber-400">{bonus}</span>
                                </div>
                              );
                            })}
                            <div className={`flex justify-between text-[10px] text-zinc-500 dark:text-zinc-400 ${a.equipment.length > 0 ? 'mt-1 border-t border-zinc-200 pt-1 dark:border-zinc-800' : ''}`}>
                              <span>
                                강화 합 <b className="text-zinc-700 dark:text-zinc-200">{a.enhanceSum}</b> <b className="text-sky-600 dark:text-sky-400">×{asMult.toFixed(2)}</b>
                              </span>
                              <span>
                                시너지 <b className="text-amber-600 dark:text-amber-400">+{syn / 100}%</b>
                              </span>
                              <span>
                                최종 <b className="text-[12px] text-zinc-900 dark:text-white">×{mult.toFixed(2)}</b>
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


      {/* 전체 새로고침 확인 */}
      {refreshAsk ? (
        <ModalShell onClose={() => setRefreshAsk(false)} label="파견 새로고침">
          <ModalLayout
            title="파견을 새로고침할까요?"
            subtitle={`미배정 슬롯 ${board.slots.filter((x) => x.state === 'offer').length}개의 파견이 모두 바뀝니다 (진행 중은 제외)`}
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
              무료 {EXPEDITION_REFRESH_FREE_PER_DAY}회를 다 쓰면 💎{board.refreshCost}이 듭니다.
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
  if (!r) return '';
  const parts: string[] = [];
  if (r.boxes) {
    const t = r.boxes.weapon + r.boxes.armor + r.boxes.accessory;
    if (t > 0) parts.push(`📦 ${t}`);
  }
  if (r.diamond) parts.push(`💎 ${r.diamond.toLocaleString('ko-KR')}`);
  return parts.join(' + ');
}

/** 이벤트 핸들러 전용 현재 시각 — 렌더 경로에서 호출 금지(React 컴파일러 순수성 규칙). */
const nowMs = () => Date.now();

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
  glow?: boolean;
  children?: React.ReactNode;
}) {
  const ui = REGION_UI[region];
  const avH = compact ? 64 : 86;
  const monH = compact ? 48 : 62;
  const gaugeCls = progress >= 1 ? 'bg-emerald-400' : progress >= 0.5 ? 'bg-orange-400' : 'bg-red-500';
  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-cover bg-center ${compact ? 'h-[104px]' : 'h-[112px]'} ${
        glow ? 'border-emerald-400/70' : 'border-zinc-800'
      }`}
      style={{ backgroundImage: `url(/sprites/expedition/bg/${region}.png)` }}
    >
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
          <span className="rounded-md bg-black/50 px-1.5 py-0.5 text-[9px] font-extrabold text-white">
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
            className="drop-shadow-[0_2px_2px_rgba(0,0,0,.8)]"
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
        <CardBody region={region} hours={hours} avatarSouth={null} reward={s.reward} status={refreshing ? '새 파견 찾는 중…' : '파견 대기'} bonusText={null} progress={0} />
      ) : (
        <Ticker>
          {(now) => {
            const remain = s.completeAtIso ? Date.parse(s.completeAtIso) - now : 0;
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
                bonusText={`×${(1 + (bonus + (s.synergyBp ?? 0)) / 10000).toFixed(2)}`}
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
