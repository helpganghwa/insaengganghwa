import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { enhancePresets, enhancementJobs } from '@/lib/db/schema/enhance';
import { catalogItems, userEquipment } from '@/lib/db/schema/equipment';

import {
  LANE_KEYS,
  PRESET_COUNT,
  laneKeyOf,
  laneNoOfLaneKey,
  normalizePresetName,
  presetNameProblem,
  planPreset,
  slotOfLaneKey,
  type EnhancePreset,
  type LaneKey,
  type PresetLaneState,
  type PresetLanes,
  type RunningLanes,
} from './preset-plan';
import { EnhanceError, queueEnhanceInTx } from './queue';

/**
 * 강화 프리셋(0246, 소서 #492) — 서버마다 3개, 전부 무료. 저장은 칸 단위 즉시(팝업에 저장 버튼 없음).
 * 적용은 **슬롯 교체와 같다**: 바뀌는 칸의 진행 중 강화를 취소(다 찬 게이지도 초기화, 수령 없음)하고 등록.
 * 한 트랜잭션·전부 아니면 전무 — 칸 하나가 실패하면(장비 없음 등) 아무 칸도 바뀌지 않는다. 취소된 뒤 등록이
 * 실패해 칸만 비는 결과를 막으려는 선택(10-21).
 */
export type PresetErrorCode = 'BAD_PRESET' | 'BAD_LANE' | 'BAD_NAME' | 'EQUIPMENT_NOT_FOUND' | 'SLOT_MISMATCH' | 'NOTHING_TO_APPLY';
export class PresetError extends Error {
  constructor(public code: PresetErrorCode) {
    super(code);
    this.name = 'PresetError';
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Dbx = typeof db | Tx;

function assertPresetNo(n: number): void {
  if (!Number.isInteger(n) || n < 1 || n > PRESET_COUNT) throw new PresetError('BAD_PRESET');
}

/** DB jsonb → 칸 상태(모르는 키·깨진 값은 버린다 — 옛 행이나 손으로 고친 값에 방어). */
function sanitizeLanes(raw: unknown): PresetLanes {
  const out: PresetLanes = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of LANE_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (!v || typeof v !== 'object') continue;
    const kind = (v as { kind?: unknown }).kind;
    if (kind === 'keep' || kind === 'empty') out[key] = { kind };
    else if (kind === 'item') {
      const id = (v as { equipmentId?: unknown }).equipmentId;
      if (typeof id === 'string' && /^\d+$/.test(id)) out[key] = { kind: 'item', equipmentId: id };
    }
  }
  return out;
}

function emptyPreset(presetNo: number): EnhancePreset {
  return { presetNo, name: '', lanes: {} };
}

/** 세 프리셋 — 행이 없는 번호는 빈 프리셋으로 채워 항상 3개를 돌려준다. */
export async function getEnhancePresets(userId: string, serverId: number, dbx: Dbx = db): Promise<EnhancePreset[]> {
  const rows = await dbx
    .select({ presetNo: enhancePresets.presetNo, name: enhancePresets.name, lanes: enhancePresets.lanes })
    .from(enhancePresets)
    .where(and(eq(enhancePresets.userId, userId), eq(enhancePresets.serverId, serverId)));
  return Array.from({ length: PRESET_COUNT }, (_, i) => {
    const r = rows.find((x) => x.presetNo === i + 1);
    return r ? { presetNo: i + 1, name: r.name, lanes: sanitizeLanes(r.lanes) } : emptyPreset(i + 1);
  });
}

async function getOne(userId: string, serverId: number, presetNo: number, dbx: Dbx): Promise<EnhancePreset> {
  const [r] = await dbx
    .select({ name: enhancePresets.name, lanes: enhancePresets.lanes })
    .from(enhancePresets)
    .where(and(eq(enhancePresets.userId, userId), eq(enhancePresets.serverId, serverId), eq(enhancePresets.presetNo, presetNo)))
    .limit(1);
  return r ? { presetNo, name: r.name, lanes: sanitizeLanes(r.lanes) } : emptyPreset(presetNo);
}

/** 지금 칸마다 올라간 진행 중 강화(없는 칸은 키 없음). */
export async function loadRunningLanes(userId: string, serverId: number, dbx: Dbx = db): Promise<RunningLanes> {
  const rows = await dbx
    .select({ id: enhancementJobs.id, slot: enhancementJobs.slot, slotLane: enhancementJobs.slotLane, equipmentId: enhancementJobs.userEquipmentId })
    .from(enhancementJobs)
    .where(and(eq(enhancementJobs.userId, userId), eq(enhancementJobs.serverId, serverId), eq(enhancementJobs.status, 'running')));
  const out: RunningLanes = {};
  for (const r of rows) out[laneKeyOf(r.slot, r.slotLane)] = { equipmentId: r.equipmentId.toString(), jobId: r.id.toString() };
  return out;
}

async function upsert(
  userId: string,
  serverId: number,
  presetNo: number,
  /** 잠근 현재 값에서 다음 값을 만든다 — 읽기와 쓰기를 같은 트랜잭션 안에 둬야 빠른 연속 저장(칸 두 개를 잇달아 고름)이 서로를 덮어쓰지 않는다. */
  mutate: (cur: EnhancePreset) => { name?: string; lanes?: PresetLanes },
): Promise<EnhancePreset> {
  // 읽고-합쳐-쓰기 — jsonb 부분 갱신을 SQL 파라미터로 보내지 않는다(문자열 이중 인코딩 함정, 09-09).
  // for update로 행을 잠근 뒤 그 값에서 다음 값을 만들므로 같은 프리셋의 연속 저장이 직렬화된다.
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ name: enhancePresets.name, lanes: enhancePresets.lanes })
      .from(enhancePresets)
      .where(and(eq(enhancePresets.userId, userId), eq(enhancePresets.serverId, serverId), eq(enhancePresets.presetNo, presetNo)))
      .for('update');
    const cur: EnhancePreset = row ? { presetNo, name: row.name, lanes: sanitizeLanes(row.lanes) } : emptyPreset(presetNo);
    const patch = mutate(cur);
    const name = patch.name ?? cur.name;
    const lanes = patch.lanes ?? cur.lanes;
    await tx
      .insert(enhancePresets)
      .values({ userId, serverId, presetNo, name, lanes, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [enhancePresets.userId, enhancePresets.serverId, enhancePresets.presetNo], set: { name, lanes, updatedAt: new Date() } });
    return { presetNo, name, lanes };
  });
}

/** 칸 하나 저장 — item이면 내 장비·내 서버·같은 부위인지 검증(부위가 다르면 적용 때 lane 식이 깨진다). */
export async function setPresetLane(
  userId: string,
  serverId: number,
  presetNo: number,
  key: LaneKey,
  state: PresetLaneState,
): Promise<EnhancePreset> {
  assertPresetNo(presetNo);
  if (!LANE_KEYS.includes(key)) throw new PresetError('BAD_LANE');
  if (state.kind === 'item') {
    if (!/^\d+$/.test(state.equipmentId)) throw new PresetError('EQUIPMENT_NOT_FOUND');
    const [row] = await db
      .select({ slot: catalogItems.slot })
      .from(userEquipment)
      .innerJoin(catalogItems, eq(userEquipment.catalogItemId, catalogItems.id))
      .where(and(eq(userEquipment.id, BigInt(state.equipmentId)), eq(userEquipment.userId, userId), eq(userEquipment.serverId, serverId)))
      .limit(1);
    if (!row) throw new PresetError('EQUIPMENT_NOT_FOUND');
    if (row.slot !== slotOfLaneKey(key)) throw new PresetError('SLOT_MISMATCH');
  }
  return upsert(userId, serverId, presetNo, (cur) => {
    const lanes: PresetLanes = { ...cur.lanes };
    if (state.kind === 'item') {
      // 같은 장비는 한 칸에만 — 다른 칸에 있던 지정은 지운다(고르면 옮겨 오는 셈, 클라 낙관 갱신과 같은 규칙).
      for (const k of LANE_KEYS) {
        const v = lanes[k];
        if (k !== key && v?.kind === 'item' && v.equipmentId === state.equipmentId) delete lanes[k];
      }
    }
    if (state.kind === 'keep') delete lanes[key];
    else lanes[key] = state;
    return { lanes };
  });
}

export async function renamePreset(userId: string, serverId: number, presetNo: number, raw: string): Promise<EnhancePreset> {
  assertPresetNo(presetNo);
  if (presetNameProblem(raw) !== null) throw new PresetError('BAD_NAME');
  const name = normalizePresetName(raw);
  return upsert(userId, serverId, presetNo, () => ({ name }));
}

/** 지금 배치를 그대로 담는다 — 강화 중인 칸은 그 장비, 비어 있는 칸은 '비우기'(적용하면 지금 배치가 그대로 재현된다). */
export async function fillPresetFromCurrent(userId: string, serverId: number, presetNo: number): Promise<EnhancePreset> {
  assertPresetNo(presetNo);
  const running = await loadRunningLanes(userId, serverId);
  const lanes: PresetLanes = {};
  for (const key of LANE_KEYS) {
    const now = running[key];
    lanes[key] = now ? { kind: 'item', equipmentId: now.equipmentId } : { kind: 'empty' };
  }
  return upsert(userId, serverId, presetNo, () => ({ lanes }));
}

export type ApplyPresetResult = {
  /** 바뀐 칸 수(다른 칸에서 옮겨 온 취소 포함). */
  changed: number;
  queued: number;
  swapped: number;
  cleared: number;
  cancelled: number;
};

/**
 * 적용 — 한 트랜잭션. ① 진행 중 잡을 잠그고 계획을 세운 뒤 ② 취소할 잡을 전부 running→cancelled 조건부 전이
 * ③ 칸 순서대로 queueEnhanceInTx(preferredLane = 그 칸). 취소가 같은 tx 안이라 partial unique가 풀려 등록이 통과한다.
 * 잠금 순서는 교체(swapEnhance)와 같다: enhancement_jobs → user_equipment.
 */
export async function applyPreset(userId: string, serverId: number, presetNo: number): Promise<ApplyPresetResult> {
  assertPresetNo(presetNo);
  return db.transaction(async (tx) => {
    const preset = await getOne(userId, serverId, presetNo, tx);
    const jobs = await tx
      .select({ id: enhancementJobs.id, slot: enhancementJobs.slot, slotLane: enhancementJobs.slotLane, equipmentId: enhancementJobs.userEquipmentId })
      .from(enhancementJobs)
      .where(and(eq(enhancementJobs.userId, userId), eq(enhancementJobs.serverId, serverId), eq(enhancementJobs.status, 'running')))
      .for('update');
    const running: RunningLanes = {};
    for (const j of jobs) running[laneKeyOf(j.slot, j.slotLane)] = { equipmentId: j.equipmentId.toString(), jobId: j.id.toString() };
    const plan = planPreset(preset.lanes, running);
    if (plan.changed === 0) throw new PresetError('NOTHING_TO_APPLY');

    const cancelIds = [
      ...plan.lanes.flatMap((p) => (p.action === 'clear' || p.action === 'swap' ? [p.cancelJobId] : [])),
      ...plan.extraCancels.map((c) => c.jobId),
    ].map((id) => BigInt(id));
    if (cancelIds.length > 0) {
      const done = await tx
        .update(enhancementJobs)
        .set({ status: 'cancelled', cancelledAt: new Date() })
        .where(and(inArray(enhancementJobs.id, cancelIds), eq(enhancementJobs.userId, userId), eq(enhancementJobs.status, 'running')))
        .returning({ id: enhancementJobs.id });
      // 잠근 뒤라 어긋날 수 없지만, 어긋나면 전체를 되돌린다(부분 적용 금지).
      if (done.length !== cancelIds.length) throw new EnhanceError('JOB_NOT_FOUND');
    }
    let queued = 0;
    let swapped = 0;
    for (const p of plan.lanes) {
      if (p.action !== 'queue' && p.action !== 'swap') continue;
      await queueEnhanceInTx(tx, { userId, userEquipmentId: BigInt(p.equipmentId), preferredLane: laneNoOfLaneKey(p.key) });
      if (p.action === 'queue') queued += 1;
      else swapped += 1;
    }
    // 감사 로그 — 취소는 반드시 흔적을 남긴다(슬롯 전멸 사건 이후 규칙, cancel.ts와 같은 형식).
    console.log(`[enhance.preset] user=${userId} preset=${presetNo} cancel=${cancelIds.join(',') || '-'} queued=${queued} swapped=${swapped}`);
    return {
      changed: plan.changed,
      queued,
      swapped,
      cleared: plan.lanes.filter((p) => p.action === 'clear').length,
      cancelled: cancelIds.length,
    };
  });
}
