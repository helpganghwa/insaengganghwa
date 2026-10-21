/**
 * 강화 프리셋 — 순수 모듈(클라·서버 공용). 칸 상태 타입과 "적용하면 무엇이 바뀌는가" 계산만 있다.
 * DB 접근은 preset.ts(server-only). 클라 팝업이 편집 중에도 바뀌는 칸 수를 바로 보여 주려고 분리했다(10-21).
 */
import type { Slot } from '@/lib/db/schema/equipment';

export const PRESET_COUNT = 3;
/** 이름 글자 수 상한(코드포인트 기준) — 세그먼트 한 칸에 들어가는 길이. */
export const PRESET_NAME_MAX = 8;

export type LaneNo = 1 | 2;
export type LaneKey = `${Slot}:${LaneNo}`;
/** 강화 탭 카드 순서 그대로(부위 → 칸). 팝업 목록과 적용 순서가 이 순서를 따른다. */
export const LANE_KEYS: LaneKey[] = ['weapon:1', 'weapon:2', 'armor:1', 'armor:2', 'accessory:1', 'accessory:2'];
export const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

/** 칸 상태 — item: 이 장비를 올린다 · keep: 손대지 않는다(기본) · empty: 진행 중 강화를 취소하고 비운다. */
export type PresetLaneState =
  | { kind: 'item'; equipmentId: string }
  | { kind: 'keep' }
  | { kind: 'empty' };
export type PresetLanes = Partial<Record<LaneKey, PresetLaneState>>;

export type EnhancePreset = {
  presetNo: number;
  /** 빈 문자열이면 화면은 '프리셋 N'으로 보여 준다. */
  name: string;
  lanes: PresetLanes;
};

/** 지금 그 칸에 올라가 있는 강화(없으면 null). equipmentId는 user_equipment.id 문자열. */
export type RunningLane = { equipmentId: string; jobId: string };
export type RunningLanes = Partial<Record<LaneKey, RunningLane>>;

export type LanePlan =
  /** 손대지 않음(keep이거나 같은 장비가 이미 그 칸에 있음). */
  | { key: LaneKey; action: 'keep' }
  /** 비우기 — 진행 중 강화 취소. */
  | { key: LaneKey; action: 'clear'; cancelJobId: string }
  /** 빈 칸에 등록. */
  | { key: LaneKey; action: 'queue'; equipmentId: string }
  /** 진행 중 강화 취소 뒤 등록(슬롯 교체와 같음 — 다 찬 게이지도 초기화). */
  | { key: LaneKey; action: 'swap'; cancelJobId: string; equipmentId: string };

export type PresetPlan = {
  lanes: LanePlan[];
  /** 프리셋 장비가 **다른 칸**에서 진행 중이라 먼저 취소해야 하는 잡(그 칸은 비게 된다). */
  extraCancels: { key: LaneKey; jobId: string }[];
  /** 바뀌는 칸 수(keep 제외). */
  changed: number;
};

export function laneKeyOf(slot: Slot, lane: number): LaneKey {
  return `${slot}:${lane === 2 ? 2 : 1}`;
}
export function slotOfLaneKey(key: LaneKey): Slot {
  return key.split(':')[0] as Slot;
}
export function laneNoOfLaneKey(key: LaneKey): LaneNo {
  return key.endsWith(':2') ? 2 : 1;
}
export function presetDisplayName(p: Pick<EnhancePreset, 'presetNo' | 'name'>): string {
  return p.name.trim() || `프리셋 ${p.presetNo}`;
}
/** 이름 정리 — 앞뒤 공백 제거, 코드포인트 PRESET_NAME_MAX까지. */
export function normalizePresetName(raw: string): string {
  // 제어 문자(줄바꿈·탭·서식 문자)는 지운다 — 탭 라벨 한 줄에 들어가야 한다.
  return Array.from(raw.replace(/[\p{Cc}\p{Cf}]/gu, '').trim()).slice(0, PRESET_NAME_MAX).join('');
}

/**
 * 적용 계획 — 프리셋 칸 상태 × 지금 올라간 강화. 순수 계산이라 서버(적용)와 클라(미리 보기)가 같은 답을 낸다.
 * 규칙(10-21 결정): keep → 그대로 · empty → 취소 · item → 같은 장비면 그대로, 아니면 취소(있으면)+등록.
 * 같은 장비가 다른 칸에서 진행 중이면 그 잡을 먼저 취소한다(장비 1개 = 동시 강화 1건) — 그 칸의 계획이
 * keep이면 결과적으로 비게 되고, 그 칸에 다른 장비를 올리는 계획이면 그대로 교체된다.
 */
export function planPreset(lanes: PresetLanes, running: RunningLanes): PresetPlan {
  const plans: LanePlan[] = [];
  // 그 칸에 **같은 장비로 지정되어** 머무는 잡은 취소 대상에서 제외한다. keep 칸의 잡은 머무르되, 그 장비를
  // 다른 칸이 원하면 옮겨 간다(아래 extraCancels — 장비 1개는 동시 강화 1건).
  const stays = new Set<string>();
  for (const key of LANE_KEYS) {
    const st = lanes[key] ?? { kind: 'keep' };
    const now = running[key];
    if (now && st.kind === 'item' && st.equipmentId === now.equipmentId) stays.add(now.jobId);
  }
  // 이 칸의 계획으로 이미 취소되는 잡.
  const cancelledByLane = new Set<string>();
  for (const key of LANE_KEYS) {
    const st = lanes[key] ?? { kind: 'keep' };
    const now = running[key];
    if (st.kind === 'keep') {
      plans.push({ key, action: 'keep' });
    } else if (st.kind === 'empty') {
      if (now) {
        plans.push({ key, action: 'clear', cancelJobId: now.jobId });
        cancelledByLane.add(now.jobId);
      } else plans.push({ key, action: 'keep' });
    } else if (now && now.equipmentId === st.equipmentId) {
      plans.push({ key, action: 'keep' });
    } else if (now) {
      plans.push({ key, action: 'swap', cancelJobId: now.jobId, equipmentId: st.equipmentId });
      cancelledByLane.add(now.jobId);
    } else {
      plans.push({ key, action: 'queue', equipmentId: st.equipmentId });
    }
  }
  // 프리셋 장비가 다른 칸에서 진행 중 → 그 잡도 취소(머무는 잡이거나 이미 취소되는 잡이면 제외).
  const extraCancels: { key: LaneKey; jobId: string }[] = [];
  const wanted = new Set(plans.flatMap((p) => (p.action === 'queue' || p.action === 'swap' ? [p.equipmentId] : [])));
  for (const key of LANE_KEYS) {
    const now = running[key];
    if (!now || !wanted.has(now.equipmentId)) continue;
    if (stays.has(now.jobId) || cancelledByLane.has(now.jobId)) continue;
    extraCancels.push({ key, jobId: now.jobId });
  }
  const changed = plans.filter((p) => p.action !== 'keep').length + extraCancels.length;
  return { lanes: plans, extraCancels, changed };
}
