import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { kstDateString } from '@/lib/kst';
import {
  EXPEDITION_REFRESH_COST,
  EXPEDITION_REFRESH_FREE_PER_DAY,
  EXPEDITION_SLOT_UNLOCKS,
  EXPEDITION_SLOTS,
  expeditionXpToNext,
  type ExpeditionDifficulty,
  type ExpeditionRegion,
} from '@/lib/game/balance';
import { critBp, effectiveSlots, snapshotExpeditionRegions, type ExpeditionReward, avatarEnhanceSum } from './engine';

/** 보드 DTO — 페이지 서버 컴포넌트가 조립해 클라 보드에 그대로 넘긴다(직렬화 안전 원시값). */
export type ExpeditionBoardSlot = {
  slot: number;
  state: 'locked' | 'offer' | 'running';
  /** locked 전용 — 해금 조건(계정 합산 강화). */
  unlock?: { enhanceSum: number };
  /** offer/running 공통 — 미션 내용(오퍼=기본 보상, 진행=최종 확정 보상). */
  region?: ExpeditionRegion;
  difficulty?: ExpeditionDifficulty;
  hours?: number;
  reward?: ExpeditionReward;
  /** running 전용. */
  completeAtIso?: string;
  synergyBp?: number;
  /** running 전용 — 배정 아바타 강화 합 배율 스냅샷(bp, §3.3). */
  reqBonusBp?: number;
  avatarId?: string | null;
  avatarFace?: string | null;
  /** running — 배정 아바타 전신(south). */
  avatarSouth?: string | null;
};

export type ExpeditionAvatar = {
  id: string;
  face: string | null;
  /** 전신(south) — 카드·팝업의 원정대원 표시(2026-08-28 UI 개편, 얼굴 썸네일 대신 전신). */
  south: string | null;
  isActive: boolean;
  isDefault: boolean;
  regions: (ExpeditionRegion | 'general')[];
  busy: boolean;
  /** 아바타 강화 합(§3.3) — 배율·권장 달성 표시. */
  enhanceSum: number;
};

export type ExpeditionBoard = {
  level: number;
  xp: number;
  xpNext: number;
  /** 현재 레벨의 대성공 확률(bp) — 헤더 표시. */
  critBp: number;
  /** 보유 아바타 강화 합 최댓값 — 안내용. */
  baseSum: number;
  /** 계정 합산 강화(보유 장비 강화 합) — 슬롯 해금 원천·헤더 표시. */
  enhanceSum: number;
  freeRefreshLeft: number;
  refreshCost: number;
  slots: ExpeditionBoardSlot[];
  avatars: ExpeditionAvatar[];
};

/** 보드 조회(읽기 전용 — 오퍼 보정은 페이지가 ensureOffers를 선행 호출). */
export async function getExpeditionBoard(userId: string, serverId: number): Promise<ExpeditionBoard> {
  const today = kstDateString();
  const [stateRows, active, avatarRows, activeProfile, levelRows, sumRows] = await Promise.all([
    db.execute(sql`
      select level, xp::text, slots_purchased, starts_kst_day::text, starts_today,
             refresh_kst_day::text, refresh_today
      from expedition_state where user_id = ${userId}::uuid and server_id = ${serverId}
    `) as unknown as Promise<
      {
        level: number; xp: string; slots_purchased: number;
        starts_kst_day: string | null; starts_today: number;
        refresh_kst_day: string | null; refresh_today: number;
      }[]
    >,
    db.execute(sql`
      select slot, status, region, difficulty, duration_ms::text, reward, final_reward,
             complete_at, synergy_bp, req_bonus_bp, avatar_profile_id::text
      from expeditions
      where user_id = ${userId}::uuid and server_id = ${serverId} and status in ('offer','running')
      order by slot
    `) as unknown as Promise<
      {
        slot: number; status: 'offer' | 'running'; region: ExpeditionRegion;
        difficulty: ExpeditionDifficulty; duration_ms: string;
        reward: ExpeditionReward; final_reward: ExpeditionReward | null;
        complete_at: string | Date | null; synergy_bp: number; req_bonus_bp: number;
        avatar_profile_id: string | null;
      }[]
    >,
    db.execute(sql`
      select up.id::text, up.rotations->>'face' as face, up.rotations->>'south' as south,
             up.equipment_snapshot,
             coalesce((up.options->>'isDefault')::boolean, false) as is_default,
             exists(select 1 from expeditions e where e.avatar_profile_id = up.id and e.status = 'running') as busy
      from user_profiles up
      where up.user_id = ${userId}::uuid and up.server_id = ${serverId}
      order by is_default desc, up.created_at desc
    `) as unknown as Promise<
      { id: string; face: string | null; south: string | null; equipment_snapshot: unknown; is_default: boolean; busy: boolean }[]
    >,
    db.execute(sql`
      select active_profile_id::text as id from characters
      where user_id = ${userId}::uuid and server_id = ${serverId}
    `) as unknown as Promise<{ id: string | null }[]>,
    db.execute(sql`
      select ci.code as key, ue.enhance_level as lv
      from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
      where ue.user_id = ${userId}::uuid and ue.server_id = ${serverId}
    `) as unknown as Promise<{ key: string; lv: number }[]>,
    // 계정 합산 강화 — 슬롯 해금 원천(service.enhanceSumOf와 동일 정의).
    db.execute(sql`
      select coalesce(sum(enhance_level), 0)::int as s from user_equipment
      where user_id = ${userId}::uuid and server_id = ${serverId}
    `) as unknown as Promise<{ s: number }[]>,
  ]);
  const enhanceSum = Number(sumRows[0]?.s ?? 0);
  const levelByKey = new Map(levelRows.map((r) => [r.key, Number(r.lv)]));
  const sumOf = (snapshot: unknown) => avatarEnhanceSum(snapshot, levelByKey);
  const baseSum = avatarRows.reduce((m, a) => Math.max(m, sumOf(a.equipment_snapshot)), 0);
  const st = stateRows[0] ?? {
    level: 0, xp: '0', slots_purchased: 1,
    starts_kst_day: null, starts_today: 0, refresh_kst_day: null, refresh_today: 0,
  };
  const eff = effectiveSlots(enhanceSum);
  const activeId = activeProfile[0]?.id ?? null;
  // 얼굴 썸네일 우선 — 기본 스프라이트는 public 정적 face.png로 매핑(채팅 displayFields와 동일 규칙).
  const faceOf = (a: { face: string | null; south: string | null }) =>
    a.face ??
    (a.south?.startsWith('/sprites/default/') ? a.south.replace('south.png', 'face.png') : a.south);
  const faceById = new Map(avatarRows.map((a) => [a.id, faceOf(a)]));
  const southById = new Map(avatarRows.map((a) => [a.id, a.south]));

  const slots: ExpeditionBoardSlot[] = [];
  for (let slot = 1; slot <= EXPEDITION_SLOTS; slot++) {
    const row = active.find((r) => r.slot === slot);
    // 닫힌 슬롯: 진행 중(running) 파견이 남아 있으면 그대로 보여준다(합산 강화 하락 케이스 — 수령까지 유지).
    if (slot > eff && row?.status !== 'running') {
      const def = EXPEDITION_SLOT_UNLOCKS.find((u) => u.slot === slot)!;
      slots.push({ slot, state: 'locked', unlock: { enhanceSum: def.enhanceSum } });
      continue;
    }
    if (!row) continue; // ensureOffers 선행 시 없을 수 없으나 방어(다음 렌더에서 채워짐)
    const hours = Math.round(Number(row.duration_ms) / 3_600_000);
    if (row.status === 'offer') {
      slots.push({ slot, state: 'offer', region: row.region, difficulty: row.difficulty, hours, reward: row.reward });
    } else {
      slots.push({
        slot,
        state: 'running',
        region: row.region,
        difficulty: row.difficulty,
        hours,
        reward: row.final_reward ?? row.reward,
        completeAtIso: row.complete_at ? new Date(row.complete_at).toISOString() : undefined,
        synergyBp: row.synergy_bp,
        reqBonusBp: row.req_bonus_bp,
        avatarId: row.avatar_profile_id,
        avatarFace: row.avatar_profile_id ? (faceById.get(row.avatar_profile_id) ?? null) : null,
        avatarSouth: row.avatar_profile_id ? (southById.get(row.avatar_profile_id) ?? null) : null,
      });
    }
  }

  const refreshToday = st.refresh_kst_day === today ? st.refresh_today : 0;
  return {
    level: st.level,
    xp: Number(st.xp),
    xpNext: expeditionXpToNext(st.level),
    critBp: critBp(st.level),
    baseSum,
    enhanceSum,
    freeRefreshLeft: Math.max(0, EXPEDITION_REFRESH_FREE_PER_DAY - refreshToday),
    refreshCost: EXPEDITION_REFRESH_COST,
    slots,
    avatars: avatarRows.map((a) => ({
      id: a.id,
      face: faceOf(a),
      south: a.south,
      isActive: a.id === activeId,
      isDefault: a.is_default,
      regions: snapshotExpeditionRegions(a.equipment_snapshot),
      busy: a.busy,
      enhanceSum: sumOf(a.equipment_snapshot),
    })),
  };
}
