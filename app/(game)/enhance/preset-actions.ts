'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { makeErr, type ActionResult } from '@/lib/game/action-result';
import { rateLimited } from '@/lib/ratelimit';
import { actionBlock } from '@/lib/game/action-gate';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';
import { catalogItems, userEquipment, type Slot } from '@/lib/db/schema/equipment';
import { liberatedItemRanks } from '@/lib/game/codex/ranking';
import {
  EnhanceError,
  PresetError,
  applyPreset,
  fillPresetFromCurrent,
  getEnhancePresets,
  loadRunningLanes,
  renamePreset,
  setPresetLane,
  type ApplyPresetResult,
} from '@/lib/game/enhance';
import { LANE_KEYS, PRESET_COUNT, type EnhancePreset, type LaneKey, type PresetLaneState, type RunningLanes } from '@/lib/game/enhance/preset-plan';

/**
 * 강화 프리셋 서버 액션(10-21, 소서 #492). 읽기(load)는 팝업을 열 때만 — 강화 페이지 렌더에는 얹지 않는다.
 * 쓰기 네 개(칸·이름·채우기·적용)는 강화 액션과 같은 관문(세션·레이트리밋·actionBlock)을 지난다.
 */
const MSG: Record<string, string> = {
  UNAUTHENTICATED: '로그인이 필요합니다.',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
  MAINTENANCE: '서버 점검 중입니다. 잠시 후 다시 시도해 주세요.',
  BANNED: '이용이 제한된 계정입니다.',
  BAD_PRESET: '프리셋을 찾을 수 없어요.',
  BAD_LANE: '칸 정보가 올바르지 않아요.',
  EQUIPMENT_NOT_FOUND: '장비를 찾을 수 없습니다.',
  SLOT_MISMATCH: '이 칸에는 다른 부위 장비를 올릴 수 없어요.',
  NOTHING_TO_APPLY: '바뀌는 칸이 없어요.',
  ALREADY_ENHANCING: '이미 강화 중인 장비입니다.',
  SLOT_BUSY: '같은 부위 슬롯이 모두 사용 중입니다.',
  JOB_NOT_FOUND: '강화 작업이 바뀌었어요. 다시 열어 확인해 주세요.',
  UNKNOWN: '지금은 처리할 수 없어요. 잠시 후 다시 시도해 주세요.',
};
const err = makeErr(MSG);

export type PresetEquipment = {
  id: string;
  code: string;
  name: string;
  slot: Slot;
  enhanceLevel: number;
  transcendLevel: number;
  championRank: number | null;
  equipped: boolean;
};
export type PresetData = { presets: EnhancePreset[]; equipment: PresetEquipment[]; running: RunningLanes };

function revalidateAll() {
  revalidatePath('/');
  revalidatePath('/enhance');
  revalidatePath('/inventory');
}

async function gate(bucket: 'enhance' | 'enhancePreset'): Promise<{ userId: string; serverId: number } | { code: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { code: 'UNAUTHENTICATED' };
  if (await rateLimited(userId, bucket)) return { code: 'RATE_LIMITED' };
  const blocked = await actionBlock();
  if (blocked) return { code: blocked };
  return { userId, serverId: await getActiveServerId() };
}

function toCode(e: unknown): string {
  if (e instanceof PresetError || e instanceof EnhanceError) return e.code;
  console.error('[enhance.preset]', e);
  return 'UNKNOWN';
}

function parseLaneKey(v: unknown): LaneKey | null {
  return typeof v === 'string' && (LANE_KEYS as string[]).includes(v) ? (v as LaneKey) : null;
}
function parseState(v: unknown): PresetLaneState | null {
  if (!v || typeof v !== 'object') return null;
  const kind = (v as { kind?: unknown }).kind;
  if (kind === 'keep' || kind === 'empty') return { kind };
  if (kind === 'item') {
    const id = (v as { equipmentId?: unknown }).equipmentId;
    if (typeof id === 'string' && /^\d+$/.test(id)) return { kind: 'item', equipmentId: id };
  }
  return null;
}
function parsePresetNo(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= PRESET_COUNT ? v : null;
}

/** 팝업 데이터 — 프리셋 3개 + 내 장비 전부(진행 중 포함 — 다른 칸에서 옮겨 올 수 있다) + 지금 칸 상태. */
export async function loadEnhancePresetsAction(): Promise<ActionResult<PresetData>> {
  const g = await gate('enhance');
  if ('code' in g) return err(g.code);
  try {
    const [presets, running, rows, ranks] = await Promise.all([
      getEnhancePresets(g.userId, g.serverId),
      loadRunningLanes(g.userId, g.serverId),
      db
        .select({
          id: userEquipment.id,
          catalogItemId: userEquipment.catalogItemId,
          enhanceLevel: userEquipment.enhanceLevel,
          transcendLevel: userEquipment.transcendLevel,
          equippedSlot: userEquipment.equippedSlot,
          code: catalogItems.code,
          name: catalogItems.name,
          slot: catalogItems.slot,
        })
        .from(userEquipment)
        .innerJoin(catalogItems, eq(userEquipment.catalogItemId, catalogItems.id))
        .where(and(eq(userEquipment.userId, g.userId), eq(userEquipment.serverId, g.serverId))),
      liberatedItemRanks(g.userId, g.serverId),
    ]);
    const equipment: PresetEquipment[] = rows.map((r) => ({
      id: r.id.toString(),
      code: r.code,
      name: r.name,
      slot: r.slot,
      enhanceLevel: r.enhanceLevel,
      transcendLevel: r.transcendLevel,
      championRank: ranks.get(r.catalogItemId) ?? null,
      equipped: r.equippedSlot !== null,
    }));
    return { status: 'success', presets, equipment, running };
  } catch (e) {
    return err(toCode(e));
  }
}

export async function setPresetLaneAction(presetNo: number, key: string, state: unknown): Promise<ActionResult<{ preset: EnhancePreset }>> {
  const g = await gate('enhance');
  if ('code' in g) return err(g.code);
  const no = parsePresetNo(presetNo);
  const k = parseLaneKey(key);
  const st = parseState(state);
  if (no === null) return err('BAD_PRESET');
  if (k === null || st === null) return err('BAD_LANE');
  try {
    return { status: 'success', preset: await setPresetLane(g.userId, g.serverId, no, k, st) };
  } catch (e) {
    return err(toCode(e));
  }
}

export async function renamePresetAction(presetNo: number, name: string): Promise<ActionResult<{ preset: EnhancePreset }>> {
  const g = await gate('enhance');
  if ('code' in g) return err(g.code);
  const no = parsePresetNo(presetNo);
  if (no === null) return err('BAD_PRESET');
  try {
    return { status: 'success', preset: await renamePreset(g.userId, g.serverId, no, typeof name === 'string' ? name : '') };
  } catch (e) {
    return err(toCode(e));
  }
}

export async function fillPresetAction(presetNo: number): Promise<ActionResult<{ preset: EnhancePreset }>> {
  const g = await gate('enhance');
  if ('code' in g) return err(g.code);
  const no = parsePresetNo(presetNo);
  if (no === null) return err('BAD_PRESET');
  try {
    return { status: 'success', preset: await fillPresetFromCurrent(g.userId, g.serverId, no) };
  } catch (e) {
    return err(toCode(e));
  }
}

/** 적용 — 바뀌는 칸의 진행 중 강화를 취소하고 등록(슬롯 교체와 같음). 성공하면 강화 페이지를 다시 그린다. */
export async function applyPresetAction(presetNo: number): Promise<ActionResult<{ result: ApplyPresetResult }>> {
  const g = await gate('enhancePreset');
  if ('code' in g) return err(g.code);
  const no = parsePresetNo(presetNo);
  if (no === null) return err('BAD_PRESET');
  try {
    const result = await applyPreset(g.userId, g.serverId, no);
    revalidateAll();
    return { status: 'success', result };
  } catch (e) {
    return err(toCode(e));
  }
}
