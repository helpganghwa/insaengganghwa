'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { josa } from 'josa';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { TranscendSprite } from '@/components/TranscendSprite';
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

/**
 * 강화 프리셋 팝업(10-21, 소서 #492) — 플로팅 버튼 → 세그먼트 1/2/3 · 강화 탭 순서의 6칸 목록 · 닫기/적용.
 * 편집은 칸·이름 단위로 즉시 저장(저장 버튼 없음). 적용은 같은 팝업 안에서 확인 단계로 바뀐 뒤 실행 —
 * 슬롯 교체와 같이 바뀌는 칸의 강화를 취소(다 찬 게이지도 초기화)하고 등록한다.
 */
export function PresetModal({ onClose }: { onClose: () => void }) {
  const { showError, showHeaderToast } = useResourceToast();
  const [data, setData] = useState<PresetData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // 팝업은 클릭 뒤에만 마운트(SSR 없음)라 저장소를 바로 읽는다(강화 등록 피커의 정렬과 같은 방식).
  const [tab, setTab] = useState<number>(loadTab);
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [picking, setPicking] = useState<LaneKey | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [busy, startBusy] = useTransition();
  const [applying, startApply] = useTransition();
  const nameInputRef = useRef<HTMLInputElement>(null);

  // 열릴 때 한 번 읽는다 — 강화 페이지 렌더에는 얹지 않는다. 마지막으로 보던 탭으로 연다.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await loadEnhancePresetsAction();
        if (!alive) return;
        if (r.status === 'error') {
          showError(`프리셋을 불러오지 못했어요 — ${r.message}`);
          setLoadFailed(true);
          return;
        }
        setData({ presets: r.presets, equipment: r.equipment, running: r.running });
      } catch {
        if (!alive) return;
        showError('프리셋을 불러오지 못했어요. 잠시 후 다시 열어 주세요.');
        setLoadFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회(showError는 안정)
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
    setData((d) => (d ? { ...d, presets: d.presets.map((p) => (p.presetNo === next.presetNo ? next : p)) } : d));
  }
  function switchTab(n: number) {
    setTab(n);
    saveTab(n);
    setEditingName(false);
  }

  function pickLane(key: LaneKey, state: PresetLaneState) {
    if (!preset) return;
    setPicking(null);
    const before = preset;
    const lanes = { ...preset.lanes };
    if (state.kind === 'item') {
      // 같은 장비는 한 칸에만(서버 setPresetLane과 같은 규칙) — 다른 칸의 같은 지정은 지운다.
      for (const k of LANE_KEYS) {
        const v = lanes[k];
        if (k !== key && v?.kind === 'item' && v.equipmentId === state.equipmentId) delete lanes[k];
      }
    }
    if (state.kind === 'keep') delete lanes[key];
    else lanes[key] = state;
    patchPreset({ ...preset, lanes }); // 낙관 — 실패하면 되돌린다
    startBusy(async () => {
      try {
        const r = await setPresetLaneAction(preset.presetNo, key, state);
        if (r.status === 'error') {
          showError(`저장 실패 — ${r.message}`);
          patchPreset(before);
          return;
        }
        patchPreset(r.preset);
      } catch {
        showError('저장이 전송되지 않았어요.');
        patchPreset(before);
      }
    });
  }

  function commitName() {
    if (!preset) return;
    setEditingName(false);
    const name = normalizePresetName(nameDraft);
    if (name === preset.name) return;
    const before = preset;
    patchPreset({ ...preset, name });
    startBusy(async () => {
      try {
        const r = await renamePresetAction(preset.presetNo, name);
        if (r.status === 'error') {
          showError(`이름 저장 실패 — ${r.message}`);
          patchPreset(before);
          return;
        }
        patchPreset(r.preset);
      } catch {
        showError('이름이 저장되지 않았어요.');
        patchPreset(before);
      }
    });
  }

  function fillFromCurrent() {
    if (!preset) return;
    startBusy(async () => {
      try {
        const r = await fillPresetAction(preset.presetNo);
        if (r.status === 'error') {
          showError(`채우기 실패 — ${r.message}`);
          return;
        }
        patchPreset(r.preset);
      } catch {
        showError('채우기가 전송되지 않았어요.');
      }
    });
  }

  function apply() {
    if (!preset || !plan || plan.changed === 0) return;
    const name = presetDisplayName(preset);
    startApply(async () => {
      try {
        const r = await applyPresetAction(preset.presetNo);
        if (r.status === 'error') {
          showError(`적용 실패 — ${r.message}`);
          setStep('edit');
          return;
        }
        showHeaderToast({
          icon: '⚒️',
          title: `${name} 적용`,
          detail: `등록 ${r.result.queued + r.result.swapped} · 취소 ${r.result.cancelled}`,
        });
        onClose();
      } catch {
        showError('적용이 전송되지 않았어요. 슬롯 상태를 확인해 주세요.');
        setStep('edit');
      }
    });
  }

  // ── 칸 한 줄 ──
  function laneRow(key: LaneKey, first: boolean) {
    const st: PresetLaneState = preset?.lanes[key] ?? { kind: 'keep' };
    const now = data?.running[key] ?? null;
    const nowEq = now ? (equipById.get(now.equipmentId) ?? null) : null;
    const nowText = nowEq ? `${nowEq.name} +${nowEq.enhanceLevel}` : now ? '강화 중' : '비어 있음';
    const changed = changedKeys.has(key) || movedKeys.has(key);
    const item = st.kind === 'item' ? (equipById.get(st.equipmentId) ?? null) : null;
    let title: React.ReactNode;
    let sub: string;
    let thumb: React.ReactNode;
    if (st.kind === 'keep') {
      title = <span className="text-zinc-500 dark:text-zinc-400">현재 장비 유지</span>;
      sub = movedKeys.has(key) ? `지금 ${nowText} → 다른 칸으로 옮겨 가 비게 돼요` : `지금 ${nowText}`;
      thumb = (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-zinc-300 text-[14px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
          ⟳
        </span>
      );
    } else if (st.kind === 'empty') {
      title = <span className="text-red-500 dark:text-red-300/90">비우기</span>;
      sub = now ? `지금 ${nowText} 취소` : '지금도 비어 있음';
      thumb = (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-red-200 text-[14px] text-red-400/80 dark:border-red-900/70">
          －
        </span>
      );
    } else {
      title = item ? (
        <span className="text-zinc-800 dark:text-zinc-200">
          {item.name}{' '}
          <span className="text-[10px] font-bold text-amber-500 tabular-nums">+{item.enhanceLevel}</span>
          {item.transcendLevel > 0 ? <span className="ml-1 text-[9px] text-violet-500 dark:text-violet-300">✦T{item.transcendLevel}</span> : null}
        </span>
      ) : (
        <span className="text-zinc-500">없는 장비</span>
      );
      sub = !changed ? '지금 그대로' : now ? `지금 ${nowText} → 교체` : '지금 비어 있음 → 등록';
      thumb = (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-black/40">
          {item ? <TranscendSprite code={item.code} slot={item.slot} level={item.transcendLevel} championRank={item.championRank} size={32} frameless /> : null}
        </span>
      );
    }
    return (
      <button
        key={key}
        type="button"
        disabled={!preset || applying}
        onClick={() => setPicking(key)}
        className={`flex w-full items-center gap-2 px-1 py-2 text-left transition active:bg-zinc-50 disabled:opacity-60 dark:active:bg-zinc-800/60 ${first ? '' : 'border-t border-zinc-100 dark:border-zinc-800'}`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${changed ? 'bg-amber-400' : 'bg-transparent'}`} />
        <span className="w-12 shrink-0 text-[10.5px] font-semibold text-zinc-500">
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

  // ── 확인 단계 한 줄(바뀌는 칸만) ──
  function changeRow(key: LaneKey, first: boolean) {
    const p = plan?.lanes.find((x) => x.key === key);
    const now = data?.running[key] ?? null;
    const nowEq = now ? (equipById.get(now.equipmentId) ?? null) : null;
    const moved = movedKeys.has(key);
    const next = p && (p.action === 'queue' || p.action === 'swap') ? (equipById.get(p.equipmentId) ?? null) : null;
    const nowText = nowEq ? `${nowEq.name} +${nowEq.enhanceLevel}` : '비어 있음';
    const nextText = next ? `${next.name} +${next.enhanceLevel}` : moved || p?.action === 'clear' ? '비어 있음' : nowText;
    const note =
      p?.action === 'swap' ? `${nowText} 취소 · 게이지 초기화`
      : p?.action === 'clear' ? `${nowText} 취소 · 게이지 초기화`
      : moved ? `${nowText} → 다른 칸으로`
      : '등록';
    const thumbOf = (e: PresetEquipment | null, dim: boolean) => (
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-white dark:bg-black/40 ${dim ? 'border-zinc-200 opacity-60 dark:border-zinc-700' : 'border-amber-400/70'}`}>
        {e ? <TranscendSprite code={e.code} slot={e.slot} level={e.transcendLevel} championRank={e.championRank} size={32} frameless /> : <span className="text-[12px] text-zinc-400">－</span>}
      </span>
    );
    return (
      <div key={key} className={`flex items-center gap-2 px-1 py-2 ${first ? '' : 'border-t border-zinc-100 dark:border-zinc-800'}`}>
        <span className="w-12 shrink-0 text-[10.5px] font-semibold text-zinc-500">
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
      <ModalShell onClose={() => (applying ? undefined : setStep('edit'))} label={`${name} 적용 확인`}>
        <ModalLayout
          title={josa(`${name}#{을} 적용할까요?`)}
          subtitle={`바뀌는 칸 ${changed} · 취소되는 강화 ${resetCount}건은 게이지가 초기화됩니다`}
          bodyPad="sm"
          maxBodyClass="max-h-[58vh]"
          footer={
            <>
              <ModalButton tone="ghost" onClick={() => setStep('edit')} disabled={applying}>
                돌아가기
              </ModalButton>
              <ModalButton tone="primary" onClick={apply} disabled={applying}>
                {applying ? '적용 중…' : '적용'}
              </ModalButton>
            </>
          }
        >
          {changedList.map((k, i) => changeRow(k, i === 0))}
          <p className="mt-1 border-t border-zinc-100 px-1 pt-2 text-[10.5px] text-zinc-500 dark:border-zinc-800">
            나머지 {LANE_KEYS.length - changedList.length}칸은 그대로입니다. 슬롯 교체와 같이 취소한 강화는 되돌릴 수 없어요.
          </p>
        </ModalLayout>
      </ModalShell>
    );
  }

  return (
    <>
      <ModalShell onClose={onClose} label="강화 프리셋" receded={picking !== null}>
        <ModalLayout
          title="강화 프리셋"
          subtitle="저장해 둔 세트를 한 번에 강화에 올립니다"
          bodyPad="sm"
          maxBodyClass="max-h-[62vh]"
          footer={
            <>
              <ModalButton tone="ghost" onClick={onClose}>
                닫기
              </ModalButton>
              <ModalButton tone="primary" onClick={() => setStep('confirm')} disabled={!preset || changed === 0 || busy || applying}>
                {changed > 0 ? `적용 · ${changed}칸` : '적용'}
              </ModalButton>
            </>
          }
        >
          {/* 세그먼트 — 탭 라벨이 곧 프리셋 이름(세금 수금/분배 탭과 같은 스타일). 오른쪽 ✎로 이름을 바꾼다. */}
          <div className="mb-1 flex items-center gap-1.5">
            <div role="tablist" className="flex min-w-0 flex-1 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-950">
              {(data?.presets ?? [1, 2, 3].map((n) => ({ presetNo: n, name: '', lanes: {} }))).map((p) => (
                <button
                  key={p.presetNo}
                  type="button"
                  role="tab"
                  aria-selected={tab === p.presetNo}
                  onClick={() => switchTab(p.presetNo)}
                  className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[12px] font-bold transition ${
                    tab === p.presetNo ? 'bg-white text-amber-600 shadow-sm dark:bg-zinc-800 dark:text-amber-400' : 'text-zinc-500'
                  }`}
                >
                  <span className={`tabular-nums ${tab === p.presetNo ? 'opacity-70' : 'text-zinc-400 dark:text-zinc-600'}`}>{p.presetNo}</span>
                  <span className="truncate">{presetDisplayName(p)}</span>
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
            <div className="px-1 py-10 text-center text-[12px] text-zinc-500">불러오는 중…</div>
          ) : loadFailed ? (
            <div className="px-1 py-10 text-center text-[12px] text-zinc-500">프리셋을 불러오지 못했어요.</div>
          ) : (
            <>
              {LANE_KEYS.map((k, i) => laneRow(k, i === 0))}
              <div className="mt-1 flex items-center justify-between gap-2 border-t border-zinc-100 px-1 pt-2 dark:border-zinc-800">
                <span className="text-[10px] text-zinc-500">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" />
                  적용하면 바뀌는 칸 · 바꾸면 바로 저장돼요
                </span>
                <button
                  type="button"
                  disabled={!preset || busy}
                  onClick={fillFromCurrent}
                  className="shrink-0 rounded-md border border-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                >
                  지금 강화 중인 장비로 채우기
                </button>
              </div>
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
