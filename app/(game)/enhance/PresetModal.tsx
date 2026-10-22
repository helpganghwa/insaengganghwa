'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { josa } from 'josa';

import { ModalShell } from '@/components/ModalShell';
import type { ActionResult } from '@/lib/game/action-result';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { TranscendSprite } from '@/components/TranscendSprite';
import { TranscendTag } from '@/components/RarityFrame';
import { useResourceToast } from '@/components/ResourceToast';
import { ZoomSafeInput } from '@/components/ui/ZoomSafeField';
import {
  LANE_KEYS,
  PRESET_NAME_MAX,
  SLOT_LABEL,
  laneNoOfLaneKey,
  normalizePresetName,
  planPreset,
  presetDisplayName,
  presetNameProblem,
  slotOfLaneKey,
  type EnhancePreset,
  type LaneKey,
  type PresetLaneState,
  type PresetLanes,
  type RunningLanes,
} from '@/lib/game/enhance/preset-plan';

import { PresetLanePicker } from './PresetLanePicker';
import {
  applyPresetAction,
  fillPresetAction,
  loadEnhancePresetsAction,
  renamePresetAction,
  setPresetLaneAction,
  type PresetData,
  type PresetEquipment,
} from './preset-actions';

/** 어디로 열지 — 진입 줄의 '편집'은 세트 목록, 칩은 그 프리셋의 적용 확인(바뀌는 칸이 없으면 편집). */
export type PresetOpen = { step: 'list' } | { step: 'edit' | 'confirm'; presetNo: number };
type Step = 'list' | 'edit' | 'confirm';

/**
 * 마지막으로 읽은 데이터 — 팝업은 **데이터가 있을 때만** 그린다(뼈대 → 실제로 바뀌며 생기던 자리 이동 방지, 10-21 피드백).
 * 진입 줄이 뜰 때 한 번 미리 읽어 두고, 열 때 캐시가 신선하면(60초 안 · 지금 올라간 칸이 서버 렌더와 같음) 그대로 쓴다.
 * 적용 뒤에는 비운다.
 */
let cached: { data: PresetData; at: number } | null = null;
let prefetching: Promise<void> | null = null;
const CACHE_TTL_MS = 60_000;
function setCached(data: PresetData | null) {
  cached = data ? { data, at: Date.now() } : null;
}
function sameRunning(a: RunningLanes, b: RunningLanes): boolean {
  return LANE_KEYS.every((k) => (a[k]?.equipmentId ?? '') === (b[k]?.equipmentId ?? '') && (a[k]?.jobId ?? '') === (b[k]?.jobId ?? ''));
}
/** 신선한 캐시(없으면 null). serverRunning = 강화 페이지가 마지막으로 그린 '지금 올라간 칸'. */
export function freshPresetCache(serverRunning: RunningLanes): PresetData | null {
  if (!cached || Date.now() - cached.at > CACHE_TTL_MS || !sameRunning(cached.data.running, serverRunning)) return null;
  return cached.data;
}
/** 진입 줄이 뜰 때 한 번 미리 읽어 둔다 — 이미 신선하면 아무것도 안 한다. 실패는 조용히(열 때 다시 읽는다). */
export function prefetchPresets(serverRunning: RunningLanes): Promise<void> {
  if (freshPresetCache(serverRunning)) return Promise.resolve();
  if (prefetching) return prefetching;
  prefetching = loadEnhancePresetsAction()
    .then((r) => {
      if (r.status === 'success') setCached({ presets: r.presets, equipment: r.equipment, running: r.running });
    })
    .catch(() => undefined)
    .finally(() => {
      prefetching = null;
    });
  return prefetching;
}

const ROW = 'flex w-full items-center gap-2 px-1 py-2 text-left';
const DIVIDER = 'border-t border-zinc-100 dark:border-zinc-800';
const THUMB = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border';
const LABEL = 'w-12 shrink-0 text-[10.5px] font-semibold text-zinc-500';
const TEXT_BTN = 'text-[11px] font-bold text-amber-600 disabled:opacity-40 dark:text-amber-400';

const laneLabel = (k: LaneKey) => `${SLOT_LABEL[slotOfLaneKey(k)]} ${laneNoOfLaneKey(k)}칸`;
const hasItemLane = (p: EnhancePreset) => LANE_KEYS.some((k) => p.lanes[k]?.kind === 'item');

/**
 * 강화 프리셋 팝업(10-21, 소서 #492) — 세트 카드 목록(P4) → 세트 편집(칸 6줄) → 적용 확인(바뀌는 칸만, C1).
 * 모든 편집은 낙관적으로 먼저 그리고 서버에 보낸다(실패하면 서버 상태로 되돌림). 적용도 확인 뒤 바로 닫고
 * 토스트를 띄운 다음 서버 결과를 기다린다 — 슬롯 교체와 같이 바뀌는 칸의 강화를 취소(찬 게이지 초기화)하고 등록.
 */
export function PresetModal({
  open,
  serverRunning,
  onClose,
  onData,
}: {
  open: PresetOpen;
  /** 강화 페이지가 마지막으로 그린 '지금 올라간 칸' — 캐시 신선도 판정에 쓴다. */
  serverRunning: RunningLanes;
  onClose: () => void;
  onData?: (d: PresetData) => void;
}) {
  const { showError, showHeaderToast } = useResourceToast();
  const [data, setDataState] = useState<PresetData | null>(() => freshPresetCache(serverRunning));
  const [step, setStep] = useState<Step>(open.step);
  const [cur, setCur] = useState<number>(open.step === 'list' ? 1 : open.presetNo);
  /** 확인 단계의 두 번째 버튼 — 칩으로 바로 왔으면 '닫기'(팝업 종료), 목록·편집에서 왔으면 '돌아가기'. */
  const [backTo, setBackTo] = useState<'close' | 'list' | 'edit'>(open.step === 'confirm' ? 'close' : 'list');
  const [picking, setPicking] = useState<LaneKey | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  /** 아직 응답이 안 온 저장 요청 — 적용은 이들이 끝난 뒤 보낸다(서버가 옛 프리셋을 적용하지 않게). */
  const pendingRef = useRef(new Set<Promise<unknown>>());

  function setData(next: PresetData) {
    setCached(next);
    setDataState(next);
    onData?.(next);
  }
  async function refresh(): Promise<boolean> {
    try {
      const r = await loadEnhancePresetsAction();
      if (r.status === 'error') {
        showError(`프리셋을 불러오지 못했어요 — ${r.message}`);
        return false;
      }
      setData({ presets: r.presets, equipment: r.equipment, running: r.running });
      return true;
    } catch {
      showError('프리셋을 불러오지 못했어요. 잠시 후 다시 열어 주세요.');
      return false;
    }
  }

  // 신선한 캐시가 없으면 읽은 뒤에 그린다(그 전엔 아무것도 안 그림). 미리 읽는 중이면 그 결과를 기다린다. 실패하면 닫는다.
  useEffect(() => {
    if (data) return;
    let alive = true;
    (async () => {
      await prefetchPresets(serverRunning);
      if (!alive) return;
      const hit = freshPresetCache(serverRunning);
      if (hit) {
        setData(hit);
        return;
      }
      const ok = await refresh();
      if (alive && !ok) onClose();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회
  }, []);
  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const presets = useMemo(() => data?.presets ?? [], [data]);
  const running: RunningLanes = useMemo(() => data?.running ?? {}, [data]);
  const preset: EnhancePreset | null = presets.find((p) => p.presetNo === cur) ?? null;
  const equipById = useMemo(() => {
    const m = new Map<string, PresetEquipment>();
    for (const e of data?.equipment ?? []) m.set(e.id, e);
    return m;
  }, [data]);
  const plans = useMemo(() => new Map(presets.map((p) => [p.presetNo, planPreset(p.lanes, running)])), [presets, running]);
  const plan = preset ? (plans.get(preset.presetNo) ?? null) : null;
  const changedKeys = useMemo(() => {
    const s = new Set<LaneKey>();
    if (!plan) return s;
    for (const p of plan.lanes) if (p.action !== 'keep') s.add(p.key);
    for (const c of plan.extraCancels) s.add(c.key);
    return s;
  }, [plan]);
  const movedKeys = useMemo(() => new Set(plan?.extraCancels.map((c) => c.key) ?? []), [plan]);

  function patchPreset(next: EnhancePreset) {
    if (!data) return;
    setData({ ...data, presets: data.presets.map((p) => (p.presetNo === next.presetNo ? next : p)) });
  }
  /**
   * 낙관적 저장 공통: 먼저 그린 뒤 보낸다. 성공 응답은 이게 마지막 요청일 때만 반영(앞선 응답이 뒤의 편집을
   * 덮지 않게), 실패하면 서버 상태를 다시 읽어 되돌린다.
   */
  function send(req: Promise<ActionResult<{ preset: EnhancePreset }>>, failMsg: string) {
    const p = req
      .then((r) => {
        if (r.status === 'error') {
          showError(`${failMsg} — ${r.message}`);
          return refresh();
        }
        if (pendingRef.current.size === 1) patchPreset(r.preset);
      })
      .catch(() => {
        showError(`${failMsg}. 연결을 확인해 주세요`);
        return refresh();
      })
      .finally(() => pendingRef.current.delete(p));
    pendingRef.current.add(p);
  }
  function goEdit(presetNo: number) {
    setCur(presetNo);
    setEditingName(false);
    setStep('edit');
  }
  function goConfirm(presetNo: number, from: 'list' | 'edit') {
    setCur(presetNo);
    setBackTo(from);
    setStep('confirm');
  }

  function pickLane(key: LaneKey, state: PresetLaneState) {
    if (!preset) return;
    setPicking(null);
    const lanes: PresetLanes = { ...preset.lanes };
    if (state.kind === 'item') {
      // 같은 장비는 한 칸에만(서버 setPresetLane과 같은 규칙) — 다른 칸의 같은 지정은 지운다.
      for (const k of LANE_KEYS) {
        const v = lanes[k];
        if (k !== key && v?.kind === 'item' && v.equipmentId === state.equipmentId) delete lanes[k];
      }
    }
    if (state.kind === 'keep') delete lanes[key];
    else lanes[key] = state;
    patchPreset({ ...preset, lanes });
    send(setPresetLaneAction(preset.presetNo, key, state), '저장 실패');
  }

  function commitName() {
    if (!preset || presetNameProblem(nameDraft) !== null) return;
    setEditingName(false);
    const name = normalizePresetName(nameDraft);
    if (name === preset.name) return;
    patchPreset({ ...preset, name });
    send(renamePresetAction(preset.presetNo, name), '이름 저장 실패');
  }

  function fillFromCurrent() {
    if (!preset || !data) return;
    const lanes: PresetLanes = {};
    for (const k of LANE_KEYS) {
      const r = data.running[k];
      lanes[k] = r ? { kind: 'item', equipmentId: r.equipmentId } : { kind: 'empty' };
    }
    patchPreset({ ...preset, lanes });
    send(fillPresetAction(preset.presetNo), '채우기 실패');
  }

  function apply() {
    if (!preset || !plan || plan.changed === 0) return;
    const name = presetDisplayName(preset);
    const queued = plan.lanes.filter((p) => p.action === 'queue' || p.action === 'swap').length;
    const cancelled = plan.lanes.filter((p) => p.action === 'swap' || p.action === 'clear').length + plan.extraCancels.length;
    const presetNo = preset.presetNo;
    const pending = [...pendingRef.current];
    // 낙관: 바로 닫고 알린다. 강화 카드는 액션이 끝나면 서버 렌더로 바뀐다. 실패는 토스트로.
    setCached(null);
    onClose();
    showHeaderToast({ icon: '⚒️', title: `${name} 적용`, detail: `등록 ${queued} · 취소 ${cancelled}` });
    (async () => {
      await Promise.allSettled(pending);
      const r = await applyPresetAction(presetNo);
      if (r.status === 'error') showError(`${name} 적용 실패 — ${r.message}`);
    })().catch(() => showError(`${name} 적용이 전송되지 않았어요. 슬롯 상태를 확인해 주세요.`));
  }

  const nowOf = (key: LaneKey) => {
    const now = running[key] ?? null;
    const eq = now ? (equipById.get(now.equipmentId) ?? null) : null;
    return { now, eq, text: eq ? `${eq.name} +${eq.enhanceLevel}` : now ? '강화 중' : '비어 있음' };
  };
  const sprite = (e: PresetEquipment, size: number) => (
    <TranscendSprite code={e.code} slot={e.slot} level={e.transcendLevel} championRank={e.championRank} size={size} frameless />
  );

  // ── 세트 카드(목록 단계) ──
  function setCard(p: EnhancePreset) {
    const pl = plans.get(p.presetNo);
    const changed = pl?.changed ?? 0;
    const active = hasItemLane(p) && changed === 0;
    return (
      <div
        key={p.presetNo}
        className={`rounded-xl border p-2.5 ${active ? 'border-amber-500/60' : 'border-zinc-200 dark:border-zinc-800'} bg-zinc-50 dark:bg-zinc-950`}
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-zinc-900 dark:text-zinc-100">{presetDisplayName(p)}</span>
          <button
            type="button"
            onClick={() => goConfirm(p.presetNo, 'list')}
            className="shrink-0 rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white transition active:scale-[0.97] disabled:opacity-40"
          >
            적용
          </button>
        </div>
        <button type="button" onClick={() => goEdit(p.presetNo)} className="mt-2 flex w-full items-center gap-1.5 text-left">
          {LANE_KEYS.map((k) => {
            const st = p.lanes[k];
            const ch = changedKeysOf(pl, k);
            if (!st || st.kind === 'keep')
              return <span key={k} className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-zinc-300 text-[11px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">⟳</span>;
            if (st.kind === 'empty')
              return <span key={k} className={`flex h-8 w-8 items-center justify-center rounded-md border border-dashed text-[11px] ${ch ? 'border-amber-400' : 'border-red-200 dark:border-red-900/70'} text-red-400/80`}>－</span>;
            const e = equipById.get(st.equipmentId) ?? null;
            return (
              <span key={k} className={`flex h-8 w-8 items-center justify-center rounded-md border bg-white dark:bg-black/40 ${ch ? 'border-amber-400' : 'border-zinc-200 dark:border-zinc-700'}`}>
                {e ? sprite(e, 28) : null}
              </span>
            );
          })}
          <span className="ml-auto shrink-0 text-[10px] font-semibold text-zinc-500">편집 ›</span>
        </button>
      </div>
    );
  }
  function changedKeysOf(pl: ReturnType<typeof planPreset> | undefined, k: LaneKey) {
    if (!pl) return false;
    return pl.lanes.some((x) => x.key === k && x.action !== 'keep') || pl.extraCancels.some((c) => c.key === k);
  }

  // ── 칸 한 줄(편집 단계): 윗줄 = 프리셋에 지정한 것, 아랫줄 = 지금 올라간 것(과 적용 결과) ──
  function laneRow(key: LaneKey, first: boolean) {
    const st: PresetLaneState = preset?.lanes[key] ?? { kind: 'keep' };
    const { now, text: nowText } = nowOf(key);
    const changed = changedKeys.has(key);
    const item = st.kind === 'item' ? (equipById.get(st.equipmentId) ?? null) : null;
    let title: React.ReactNode;
    let sub: string;
    let thumb: React.ReactNode;
    if (st.kind === 'keep') {
      title = <span className="text-zinc-500 dark:text-zinc-400">현재 장비 유지</span>;
      sub = movedKeys.has(key) ? `${nowText} → 다른 칸으로` : nowText;
      thumb = <span className={`${THUMB} border-dashed border-zinc-300 text-[14px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500`}>⟳</span>;
    } else if (st.kind === 'empty') {
      title = <span className="text-red-500 dark:text-red-300/90">비우기</span>;
      sub = now ? `${nowText} 취소` : '비어 있음';
      thumb = <span className={`${THUMB} border-dashed border-red-200 text-[14px] text-red-400/80 dark:border-red-900/70`}>－</span>;
    } else {
      title = item ? (
        <span className="text-zinc-800 dark:text-zinc-200">
          {item.name} <span className="text-[10px] font-bold text-amber-500 tabular-nums">+{item.enhanceLevel}</span>
          {item.transcendLevel > 0 ? <TranscendTag level={item.transcendLevel} className="ml-1 text-[10px] font-bold" /> : null}
        </span>
      ) : (
        <span className="text-zinc-500">없는 장비</span>
      );
      sub = !changed ? '그대로' : now ? `${nowText} → 교체` : '비어 있음 → 등록';
      thumb = <span className={`${THUMB} border-zinc-200 bg-white dark:border-zinc-700 dark:bg-black/40`}>{item ? sprite(item, 32) : null}</span>;
    }
    return (
      <button
        key={key}
        type="button"
        onClick={() => setPicking(key)}
        className={`${ROW} transition active:bg-zinc-50 disabled:opacity-60 dark:active:bg-zinc-800/60 ${first ? '' : DIVIDER}`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${changed ? 'bg-amber-400' : 'bg-transparent'}`} />
        <span className={LABEL}>{laneLabel(key)}</span>
        {thumb}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold">{title}</span>
          <span className="block truncate text-[10px] text-zinc-400 dark:text-zinc-600">{sub}</span>
        </span>
        <span className="text-zinc-400 dark:text-zinc-600">›</span>
      </button>
    );
  }

  // ── 확인 단계 한 줄: 6칸 전부, 전 → 후. 안 바뀌는 칸은 흐리게 '그대로'(10-21 피드백: 늘 6칸이 보이게) ──
  function changeRow(key: LaneKey, first: boolean) {
    const p = plan?.lanes.find((x) => x.key === key);
    const st: PresetLaneState = preset?.lanes[key] ?? { kind: 'keep' };
    const { eq: nowEq, text: nowText } = nowOf(key);
    const moved = movedKeys.has(key);
    const changed = changedKeys.has(key);
    const thumbOf = (e: PresetEquipment | null, tone: 'dim' | 'next' | 'same' | 'keep' | 'empty') => {
      if (tone === 'keep') return <span className={`${THUMB} border-dashed border-zinc-300 text-[14px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500`}>⟳</span>;
      if (tone === 'empty') return <span className={`${THUMB} border-dashed border-red-200 text-[14px] text-red-400/80 dark:border-red-900/70`}>－</span>;
      const b = tone === 'dim' ? 'border-zinc-200 opacity-60 dark:border-zinc-700' : tone === 'next' ? 'border-amber-400/70' : 'border-zinc-200 dark:border-zinc-700';
      return (
        <span className={`${THUMB} bg-white dark:bg-black/40 ${b}`}>
          {e ? sprite(e, 32) : <span className="text-[12px] text-zinc-400">－</span>}
        </span>
      );
    };
    let next: React.ReactNode;
    let nextText: string;
    let note: string;
    if (changed) {
      const nextEq = p && (p.action === 'queue' || p.action === 'swap') ? (equipById.get(p.equipmentId) ?? null) : null;
      next = thumbOf(nextEq, 'next');
      nextText = nextEq ? `${nextEq.name} +${nextEq.enhanceLevel}` : '비어 있음';
      note = p?.action === 'swap' || p?.action === 'clear' ? `${nowText} 취소` : moved ? `${nowText} → 다른 칸으로` : '등록';
    } else if (st.kind === 'item') {
      next = thumbOf(nowEq, 'same');
      nextText = nowText;
      note = '그대로';
    } else {
      next = thumbOf(null, st.kind);
      nextText = st.kind === 'keep' ? nowText : '비어 있음';
      note = '그대로';
    }
    return (
      <div key={key} className={`${ROW} ${first ? '' : DIVIDER} ${changed ? '' : 'opacity-50'}`}>
        <span className={LABEL}>{laneLabel(key)}</span>
        {thumbOf(nowEq, 'dim')}
        <span className="text-zinc-400 dark:text-zinc-600">→</span>
        {next}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-zinc-800 dark:text-zinc-200">{nextText}</span>
          <span className={`block truncate text-[10px] ${changed ? 'text-amber-500 dark:text-amber-400' : 'text-zinc-400 dark:text-zinc-600'}`}>{note}</span>
        </span>
      </div>
    );
  }

  const name = preset ? presetDisplayName(preset) : '';
  const changed = plan?.changed ?? 0;
  const nameProblem = editingName ? presetNameProblem(nameDraft) : null;

  // 데이터가 올 때까지는 아무것도 그리지 않는다(자리 이동 없이 완성된 팝업만 보이게).
  if (!data || !preset) return null;

  if (step === 'confirm') {
    const resetCount = plan ? plan.lanes.filter((p) => p.action === 'swap' || p.action === 'clear').length + plan.extraCancels.length : 0;
    const back = backTo === 'close' ? onClose : () => setStep(backTo);
    const backLabel = backTo === 'close' ? '닫기' : '돌아가기';
    // 바뀌는 칸이 없으면 적용 대신 상황 안내 — 빈 세트는 편집으로 보내고, 이미 올라간 세트는 그렇다고만. 6칸은 그대로 보여 준다.
    if (changed === 0) {
      const empty = !hasItemLane(preset);
      return (
        <ModalShell onClose={back} label={`${name} 적용`}>
          <ModalLayout
            title={josa(empty ? `${name}#{은} 비어 있어요` : `${name}#{은} 이미 올라가 있어요`)}
            subtitle={empty ? '편집에서 칸에 장비를 넣어 주세요' : '지금 슬롯과 같아서 바뀌는 칸이 없어요'}
            bodyPad="sm"
            maxBodyClass="max-h-[58vh]"
            footer={
              empty ? (
                <>
                  <ModalButton tone="ghost" onClick={back}>
                    {backLabel}
                  </ModalButton>
                  <ModalButton tone="primary" onClick={() => goEdit(preset.presetNo)}>
                    편집
                  </ModalButton>
                </>
              ) : (
                <ModalButton tone="ghost" onClick={back}>
                  확인
                </ModalButton>
              )
            }
          >
            {LANE_KEYS.map((k, i) => changeRow(k, i === 0))}
          </ModalLayout>
        </ModalShell>
      );
    }
    return (
      <ModalShell onClose={back} label={`${name} 적용 확인`}>
        <ModalLayout
          title={josa(`${name}#{을} 적용할까요?`)}
          subtitle={resetCount > 0 ? `취소되는 강화 ${resetCount}건은 게이지가 초기화됩니다` : undefined}
          bodyPad="sm"
          maxBodyClass="max-h-[58vh]"
          footer={
            <>
              <ModalButton tone="ghost" onClick={back}>
                {backLabel}
              </ModalButton>
              <ModalButton tone="primary" onClick={apply}>
                적용
              </ModalButton>
            </>
          }
        >
          {LANE_KEYS.map((k, i) => changeRow(k, i === 0))}
        </ModalLayout>
      </ModalShell>
    );
  }

  if (step === 'edit') {
    const back = () => {
      setEditingName(false);
      setStep('list');
    };
    return (
      <>
        <ModalShell onClose={back} label={`${name} 편집`} receded={picking !== null}>
          <ModalLayout
            title={name}
            subtitle={
              <button
                type="button"
                disabled={editingName}
                onClick={() => {
                  setNameDraft(preset.name);
                  setEditingName(true);
                }}
                className={TEXT_BTN}
              >
                이름 바꾸기
              </button>
            }
            bodyPad="sm"
            maxBodyClass="max-h-[62vh]"
            footer={
              <>
                <ModalButton tone="ghost" onClick={back}>
                  돌아가기
                </ModalButton>
                <ModalButton tone="primary" onClick={() => goConfirm(preset.presetNo, 'edit')}>
                  적용
                </ModalButton>
              </>
            }
          >
            {editingName ? (
              <div className="px-1 pt-1 pb-2">
                <div className="flex items-center gap-2">
                  {/* 한글·영문·숫자 1~8자(비속어는 서버가 거름). IME 합성 여유로 maxLength는 2배, 실제 한도는 presetNameProblem. */}
                  <ZoomSafeInput
                    ref={nameInputRef}
                    value={nameDraft}
                    maxLength={PRESET_NAME_MAX * 2}
                    placeholder={`1~${PRESET_NAME_MAX}자 (한글·영문·숫자)`}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing && nameProblem === null) commitName();
                      if (e.key === 'Escape') setEditingName(false);
                    }}
                    wrapClassName="h-9 flex-1"
                    className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-zinc-900 dark:border-zinc-700 dark:bg-black/40 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    disabled={nameProblem !== null}
                    onClick={commitName}
                    className="h-9 shrink-0 rounded-md bg-amber-500 px-3 text-[12px] font-extrabold text-black disabled:opacity-40"
                  >
                    확인
                  </button>
                </div>
                <p className={`mt-1 truncate text-[10px] ${nameProblem ? 'text-red-500 dark:text-red-300/90' : 'text-zinc-400 dark:text-zinc-600'}`}>
                  {nameProblem ?? (nameDraft.trim() ? `${Array.from(nameDraft.trim()).length} / ${PRESET_NAME_MAX}자` : `비워 두면 프리셋 ${preset.presetNo}`)}
                </p>
              </div>
            ) : null}
            {LANE_KEYS.map((k, i) => laneRow(k, i === 0))}
            <button
              type="button"
              onClick={fillFromCurrent}
              className={`${DIVIDER} mt-1 w-full py-2 text-center text-[11px] font-semibold text-zinc-500 transition active:text-zinc-800 dark:active:text-zinc-200`}
            >
              강화 중인 장비로 채우기
            </button>
          </ModalLayout>
        </ModalShell>
        {picking ? (
          <PresetLanePicker
            laneKey={picking}
            presetName={name}
            current={preset.lanes[picking] ?? { kind: 'keep' }}
            equipment={data.equipment.filter((e) => e.slot === slotOfLaneKey(picking))}
            onPick={(st) => pickLane(picking, st)}
            onClose={() => setPicking(null)}
          />
        ) : null}
      </>
    );
  }

  return (
    <ModalShell onClose={onClose} label="강화 프리셋">
      <ModalLayout
        title="강화 프리셋"
        bodyPad="sm"
        maxBodyClass="max-h-[62vh]"
        footer={
          <ModalButton tone="ghost" onClick={onClose}>
            닫기
          </ModalButton>
        }
      >
        <div className="space-y-2 p-1">{presets.map(setCard)}</div>
      </ModalLayout>
    </ModalShell>
  );
}
