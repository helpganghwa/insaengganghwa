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
  slotOfLaneKey,
  type EnhancePreset,
  type LaneKey,
  type PresetLaneState,
  type PresetLanes,
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

const TAB_STORAGE_KEY = 'ig:enhance-preset-tab';
function loadTab(): number {
  try {
    const n = Number(window.localStorage.getItem(TAB_STORAGE_KEY));
    return n >= 1 && n <= 3 ? n : 1;
  } catch {
    return 1;
  }
}
function saveTab(n: number) {
  try {
    window.localStorage.setItem(TAB_STORAGE_KEY, String(n));
  } catch {
    /* 비공개 창 등 */
  }
}

/** 마지막으로 읽은 데이터 — 다시 열 때 이걸로 먼저 그리고 뒤에서 새로 읽는다(적용 뒤에는 비운다). */
let cached: PresetData | null = null;

const ROW = 'flex w-full items-center gap-2 px-1 py-2 text-left';
const DIVIDER = 'border-t border-zinc-100 dark:border-zinc-800';
const THUMB = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border';
const LABEL = 'w-12 shrink-0 text-[10.5px] font-semibold text-zinc-500';

/**
 * 강화 프리셋 팝업(10-21, 소서 #492) — 플로팅 버튼 → 탭 1/2/3 · 강화 탭 순서의 6칸 목록 · 닫기/적용.
 * 모든 편집은 낙관적으로 먼저 그리고 서버에 보낸다(실패하면 서버 상태로 되돌림). 적용도 확인 뒤 바로 닫고
 * 토스트를 띄운 다음 서버 결과를 기다린다 — 슬롯 교체와 같이 바뀌는 칸의 강화를 취소(찬 게이지 초기화)하고 등록.
 */
export function PresetModal({ onClose }: { onClose: () => void }) {
  const { showError, showHeaderToast } = useResourceToast();
  const [data, setData] = useState<PresetData | null>(() => cached);
  const [loadFailed, setLoadFailed] = useState(false);
  // 팝업은 클릭 뒤에만 마운트(SSR 없음)라 저장소를 바로 읽는다(강화 등록 피커의 정렬과 같은 방식).
  const [tab, setTab] = useState<number>(loadTab);
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [picking, setPicking] = useState<LaneKey | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  /** 아직 응답이 안 온 저장 요청 — 적용은 이들이 끝난 뒤 보낸다(서버가 옛 프리셋을 적용하지 않게). */
  const pendingRef = useRef(new Set<Promise<unknown>>());

  async function refresh(): Promise<boolean> {
    try {
      const r = await loadEnhancePresetsAction();
      if (r.status === 'error') {
        showError(`프리셋을 불러오지 못했어요 — ${r.message}`);
        return false;
      }
      cached = { presets: r.presets, equipment: r.equipment, running: r.running };
      setData(cached);
      return true;
    } catch {
      showError('프리셋을 불러오지 못했어요. 잠시 후 다시 열어 주세요.');
      return false;
    }
  }

  // 열릴 때 한 번 읽는다 — 강화 페이지 렌더에는 얹지 않는다. 캐시가 있으면 그걸 먼저 보이고 조용히 갱신.
  useEffect(() => {
    let alive = true;
    // 마이크로태스크로 한 박자 미룸 — 효과 본문에서 상태를 바로 바꾸지 않는다(react-hooks/set-state-in-effect).
    Promise.resolve()
      .then(refresh)
      .then((ok) => {
        if (alive && !ok && !cached) setLoadFailed(true);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회
  }, []);
  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const preset: EnhancePreset | null = data ? (data.presets.find((p) => p.presetNo === tab) ?? null) : null;
  const equipById = useMemo(() => {
    const m = new Map<string, PresetEquipment>();
    for (const e of data?.equipment ?? []) m.set(e.id, e);
    return m;
  }, [data]);
  const plan = useMemo(() => (preset && data ? planPreset(preset.lanes, data.running) : null), [preset, data]);
  const changedKeys = useMemo(() => {
    const s = new Set<LaneKey>();
    if (!plan) return s;
    for (const p of plan.lanes) if (p.action !== 'keep') s.add(p.key);
    return s;
  }, [plan]);
  const movedKeys = useMemo(() => new Set(plan?.extraCancels.map((c) => c.key) ?? []), [plan]);

  function patchPreset(next: EnhancePreset) {
    setData((d) => {
      if (!d) return d;
      const out = { ...d, presets: d.presets.map((p) => (p.presetNo === next.presetNo ? next : p)) };
      cached = out;
      return out;
    });
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
  function switchTab(n: number) {
    setTab(n);
    saveTab(n);
    setEditingName(false);
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
    if (!preset) return;
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
    cached = null;
    onClose();
    showHeaderToast({ icon: '⚒️', title: `${name} 적용`, detail: `등록 ${queued} · 취소 ${cancelled}` });
    (async () => {
      await Promise.allSettled(pending);
      const r = await applyPresetAction(presetNo);
      if (r.status === 'error') showError(`${name} 적용 실패 — ${r.message}`);
    })().catch(() => showError(`${name} 적용이 전송되지 않았어요. 슬롯 상태를 확인해 주세요.`));
  }

  const nowOf = (key: LaneKey) => {
    const now = data?.running[key] ?? null;
    const eq = now ? (equipById.get(now.equipmentId) ?? null) : null;
    return { now, eq, text: eq ? `${eq.name} +${eq.enhanceLevel}` : now ? '강화 중' : '비어 있음' };
  };

  // ── 칸 한 줄: 윗줄 = 프리셋에 지정한 것, 아랫줄 = 지금 올라간 것(과 적용 결과) ──
  function laneRow(key: LaneKey, first: boolean) {
    const st: PresetLaneState = preset?.lanes[key] ?? { kind: 'keep' };
    const { now, text: nowText } = nowOf(key);
    const changed = changedKeys.has(key) || movedKeys.has(key);
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
      thumb = (
        <span className={`${THUMB} border-zinc-200 bg-white dark:border-zinc-700 dark:bg-black/40`}>
          {item ? <TranscendSprite code={item.code} slot={item.slot} level={item.transcendLevel} championRank={item.championRank} size={32} frameless /> : null}
        </span>
      );
    }
    return (
      <button
        key={key}
        type="button"
        disabled={!preset}
        onClick={() => setPicking(key)}
        className={`${ROW} transition active:bg-zinc-50 disabled:opacity-60 dark:active:bg-zinc-800/60 ${first ? '' : DIVIDER}`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${changed ? 'bg-amber-400' : 'bg-transparent'}`} />
        <span className={LABEL}>
          {SLOT_LABEL[slotOfLaneKey(key)]} {laneNoOfLaneKey(key)}칸
        </span>
        {thumb}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold">{title}</span>
          <span className="block truncate text-[10px] text-zinc-400 dark:text-zinc-600">{sub}</span>
        </span>
        <span className="text-zinc-400 dark:text-zinc-600">›</span>
      </button>
    );
  }

  // ── 확인 단계 한 줄(바뀌는 칸만): 전 → 후 ──
  function changeRow(key: LaneKey, first: boolean) {
    const p = plan?.lanes.find((x) => x.key === key);
    const { eq: nowEq, text: nowText } = nowOf(key);
    const moved = movedKeys.has(key);
    const next = p && (p.action === 'queue' || p.action === 'swap') ? (equipById.get(p.equipmentId) ?? null) : null;
    const nextText = next ? `${next.name} +${next.enhanceLevel}` : moved || p?.action === 'clear' ? '비어 있음' : nowText;
    const note = p?.action === 'swap' || p?.action === 'clear' ? `${nowText} 취소` : moved ? `${nowText} → 다른 칸으로` : '등록';
    const thumbOf = (e: PresetEquipment | null, dim: boolean) => (
      <span className={`${THUMB} bg-white dark:bg-black/40 ${dim ? 'border-zinc-200 opacity-60 dark:border-zinc-700' : 'border-amber-400/70'}`}>
        {e ? <TranscendSprite code={e.code} slot={e.slot} level={e.transcendLevel} championRank={e.championRank} size={32} frameless /> : <span className="text-[12px] text-zinc-400">－</span>}
      </span>
    );
    return (
      <div key={key} className={`${ROW} ${first ? '' : DIVIDER}`}>
        <span className={LABEL}>
          {SLOT_LABEL[slotOfLaneKey(key)]} {laneNoOfLaneKey(key)}칸
        </span>
        {thumbOf(nowEq, true)}
        <span className="text-zinc-400 dark:text-zinc-600">→</span>
        {thumbOf(next, false)}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-zinc-800 dark:text-zinc-200">{nextText}</span>
          <span className="block truncate text-[10px] text-zinc-400 dark:text-zinc-600">{note}</span>
        </span>
      </div>
    );
  }

  const name = preset ? presetDisplayName(preset) : '';
  const changed = plan?.changed ?? 0;
  const resetCount = plan ? plan.lanes.filter((p) => p.action === 'swap' || p.action === 'clear').length + plan.extraCancels.length : 0;
  const changedList = LANE_KEYS.filter((k) => changedKeys.has(k) || movedKeys.has(k));

  if (step === 'confirm' && preset && plan) {
    return (
      <ModalShell onClose={() => setStep('edit')} label={`${name} 적용 확인`}>
        <ModalLayout
          title={josa(`${name}#{을} 적용할까요?`)}
          subtitle={resetCount > 0 ? `취소되는 강화 ${resetCount}건은 게이지가 초기화됩니다` : undefined}
          bodyPad="sm"
          maxBodyClass="max-h-[58vh]"
          footer={
            <>
              <ModalButton tone="ghost" onClick={() => setStep('edit')}>
                돌아가기
              </ModalButton>
              <ModalButton tone="primary" onClick={apply}>
                적용
              </ModalButton>
            </>
          }
        >
          {changedList.map((k, i) => changeRow(k, i === 0))}
        </ModalLayout>
      </ModalShell>
    );
  }

  const tabs = data?.presets ?? [1, 2, 3].map((n) => ({ presetNo: n, name: '', lanes: {} as PresetLanes }));
  return (
    <>
      <ModalShell onClose={onClose} label="강화 프리셋" receded={picking !== null}>
        <ModalLayout
          title="강화 프리셋"
          bodyPad="sm"
          maxBodyClass="max-h-[62vh]"
          footer={
            <>
              <ModalButton tone="ghost" onClick={onClose}>
                닫기
              </ModalButton>
              <ModalButton tone="primary" onClick={() => setStep('confirm')} disabled={!preset || changed === 0}>
                {changed > 0 ? `적용 · ${changed}칸` : '적용'}
              </ModalButton>
            </>
          }
        >
          {/* 탭 라벨이 곧 프리셋 이름(세금 수금/분배 탭과 같은 스타일). 오른쪽 ✎로 이름을 바꾼다. */}
          <div className="mb-1 flex items-center gap-1.5">
            <div role="tablist" className="flex min-w-0 flex-1 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-950">
              {tabs.map((p) => (
                <button
                  key={p.presetNo}
                  type="button"
                  role="tab"
                  aria-selected={tab === p.presetNo}
                  onClick={() => switchTab(p.presetNo)}
                  className={`min-w-0 flex-1 truncate rounded-lg py-1.5 text-[12px] font-bold transition ${
                    tab === p.presetNo ? 'bg-white text-amber-600 shadow-sm dark:bg-zinc-800 dark:text-amber-400' : 'text-zinc-500'
                  }`}
                >
                  {presetDisplayName(p)}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label="이름 바꾸기"
              disabled={!preset}
              onClick={() => {
                if (!preset) return;
                setNameDraft(preset.name);
                setEditingName(true);
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-[12px] text-zinc-500 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
            >
              ✎
            </button>
          </div>
          {editingName && preset ? (
            <div className="flex items-center gap-2 px-1 py-1.5">
              <ZoomSafeInput
                ref={nameInputRef}
                value={nameDraft}
                maxLength={PRESET_NAME_MAX}
                placeholder={`프리셋 ${preset.presetNo}`}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitName();
                  if (e.key === 'Escape') setEditingName(false);
                }}
                wrapClassName="h-9 flex-1"
                className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-zinc-900 dark:border-zinc-700 dark:bg-black/40 dark:text-zinc-100"
              />
              <button type="button" onClick={commitName} className="h-9 shrink-0 rounded-md bg-amber-500 px-3 text-[12px] font-extrabold text-black">
                확인
              </button>
            </div>
          ) : null}

          {!data && !loadFailed ? (
            // 뼈대 — 실제 줄과 같은 높이라 데이터가 오면 자리 이동 없이 채워진다.
            LANE_KEYS.map((k, i) => (
              <div key={k} className={`${ROW} animate-pulse ${i === 0 ? '' : DIVIDER}`}>
                <span className="h-1.5 w-1.5 shrink-0" />
                <span className={LABEL}>
                  {SLOT_LABEL[slotOfLaneKey(k)]} {laneNoOfLaneKey(k)}칸
                </span>
                <span className={`${THUMB} border-zinc-100 dark:border-zinc-800`} />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="h-2.5 w-24 rounded bg-zinc-100 dark:bg-zinc-800" />
                  <span className="h-2 w-16 rounded bg-zinc-100 dark:bg-zinc-800" />
                </span>
              </div>
            ))
          ) : loadFailed ? (
            <div className="px-1 py-10 text-center text-[12px] text-zinc-500">프리셋을 불러오지 못했어요.</div>
          ) : (
            <>
              {LANE_KEYS.map((k, i) => laneRow(k, i === 0))}
              <button
                type="button"
                disabled={!preset}
                onClick={fillFromCurrent}
                className={`${DIVIDER} mt-1 w-full py-2 text-center text-[11px] font-semibold text-zinc-500 transition active:text-zinc-800 disabled:opacity-40 dark:active:text-zinc-200`}
              >
                강화 중인 장비로 채우기
              </button>
            </>
          )}
        </ModalLayout>
      </ModalShell>
      {picking && preset && data ? (
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
