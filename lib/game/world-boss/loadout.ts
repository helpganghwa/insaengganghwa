import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { pieceCombatPower } from '@/lib/game/balance';
import { WORLD_BOSS_AVATAR_BONUS, WORLD_BOSS_WEAK_BONUS, worldBossPhaseOf } from '@/lib/game/guild/balance';
import { spritePath } from '@/lib/game/equipment/sprite-manifest';

import { WEAK_SLOTS, type WeakSlot } from './weak';

/**
 * 월드보스 장착 상태(docs/WORLD-BOSS.md §3) — 화면용 읽기. 전투 판정은 출발 트랜잭션(party.ts)이 따로 한다.
 * 화면에서 쓰는 "약점"은 **공개된 약점만**이다(공개 전 약점은 아무도 모른다).
 */
export type LoadoutPiece = { ueid: string; slot: WeakSlot; code: string; name: string; cp: number; src: string | null; av: boolean; weak: boolean };
export type Loadout = { pieces: LoadoutPiece[]; hasAvatar: boolean; power: number; weakCount: number; avatarCount: number };
export type KnownWeak = { code: string; slot: WeakSlot; name: string; src: string | null };

type EqRow = { uid: string; ueid: string; code: string; name: string; slot: string; el: number; tl: number };
type OwnRow = { ueid: string; code: string; name: string; slot: string; el: number; tl: number; on_: boolean };

const isSlot = (s: string): s is WeakSlot => s === 'weapon' || s === 'armor' || s === 'accessory';

/** 부위 하나의 월드보스 전투력(보너스 포함). 커스텀 아바타면 약점 장비 부위도 아바타 보너스를 유지한다. */
export function piecePower(cp: number, avatarMatch: boolean, hasAvatar: boolean, weak: boolean): number {
  const av = avatarMatch || (hasAvatar && weak);
  return cp * (1 + (av ? WORLD_BOSS_AVATAR_BONUS : 0) + (weak ? WORLD_BOSS_WEAK_BONUS : 0));
}

/** 지금 공격 중인 단계의 페이즈와 그 구간. */
export function currentPhase(stage: number): { index: number; from: number; to: number } {
  const index = worldBossPhaseOf(stage + 1);
  return { index, from: index * 5 + 1, to: index * 5 + 5 };
}

/** 그 페이즈에서 공개된 약점(이름·그림). 처음 맞힌 대원은 표(finder_*)에만 남고 화면엔 내지 않는다(10-10 사용자 결정). */
export async function knownWeakOf(bossId: string, phase: number): Promise<KnownWeak[]> {
  const rows = (await db.execute(sql`
    select r.code, r.slot, coalesce(ci.name, r.code) as name
      from world_boss_weak_reveals r left join catalog_items ci on ci.code = r.code
     where r.boss_id = ${bossId}::bigint and r.phase = ${phase}
     order by case r.slot when 'weapon' then 0 when 'armor' then 1 else 2 end, r.revealed_at`)) as unknown as { code: string; slot: string; name: string }[];
  return rows.filter((r) => isSlot(r.slot)).map((r) => ({ code: r.code, slot: r.slot as WeakSlot, name: r.name, src: spritePath(r.code) }));
}

/** 사람들의 장착 상태(장착 3개 + 대표 아바타) — 공개된 약점 기준 전투력. */
export async function loadoutsOf(serverId: number, userIds: string[], known: ReadonlySet<string>): Promise<Map<string, Loadout>> {
  const out = new Map<string, Loadout>();
  const ids = [...new Set(userIds)].filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (ids.length === 0) return out;
  const arr = `{${ids.join(',')}}`;
  const [eqRows, avRows] = await Promise.all([
    db.execute(sql`
      select ue.user_id::text as uid, ue.id::text as ueid, ci.code, ci.name, ci.slot::text as slot, ue.enhance_level as el, ue.transcend_level as tl
        from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
       where ue.server_id = ${serverId} and ue.equipped_slot is not null and ue.user_id = any(${arr}::uuid[])`) as unknown as Promise<EqRow[]>,
    db.execute(sql`
      select c.user_id::text as uid, up.equipment_snapshot as snap, coalesce((up.options->>'isDefault')::boolean, false) as is_default
        from characters c left join user_profiles up on up.id = c.active_profile_id
       where c.server_id = ${serverId} and c.user_id = any(${arr}::uuid[])`) as unknown as Promise<{ uid: string; snap: unknown; is_default: boolean }[]>,
  ]);
  const avatar = new Map<string, Record<string, unknown> | null>();
  for (const r of avRows) avatar.set(r.uid, !r.is_default && r.snap && typeof r.snap === 'object' && typeof (r.snap as Record<string, unknown>).weaponKey === 'string' ? (r.snap as Record<string, unknown>) : null);
  const byUser = new Map<string, EqRow[]>();
  for (const r of eqRows) (byUser.get(r.uid) ?? byUser.set(r.uid, []).get(r.uid)!).push(r);
  for (const uid of ids) {
    const snap = avatar.get(uid) ?? null;
    const pieces: LoadoutPiece[] = (byUser.get(uid) ?? [])
      .filter((r) => isSlot(r.slot))
      .map((r) => ({ ueid: r.ueid, slot: r.slot as WeakSlot, code: r.code, name: r.name, cp: Math.round(pieceCombatPower(Number(r.el), Number(r.tl))), src: spritePath(r.code), av: !!snap && snap[`${r.slot}Key`] === r.code, weak: known.has(r.code) }))
      .sort((a, b) => WEAK_SLOTS.indexOf(a.slot) - WEAK_SLOTS.indexOf(b.slot));
    const power = Math.round(pieces.reduce((s, p) => s + piecePower(p.cp, p.av, !!snap, p.weak), 0));
    out.set(uid, { pieces, hasAvatar: !!snap, power, weakCount: pieces.filter((p) => p.weak).length, avatarCount: pieces.filter((p) => p.av || (!!snap && p.weak)).length });
  }
  return out;
}

/**
 * 가진 장비 중 공개된 약점·아바타 보너스까지 계산한 부위별 가장 좋은 장비 — "약점에 맞춰 장착" 버튼의 제안.
 * 지금 장착과 같으면 null.
 */
export async function bestLoadoutOf(serverId: number, userId: string, known: ReadonlySet<string>): Promise<{ ueids: string[]; power: number; pieces: LoadoutPiece[] } | null> {
  const [rows, [av]] = await Promise.all([
    db.execute(sql`
      select ue.id::text as ueid, ci.code, ci.name, ci.slot::text as slot, ue.enhance_level as el, ue.transcend_level as tl, ue.equipped_slot is not null as on_
        from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
       where ue.server_id = ${serverId} and ue.user_id = ${userId}::uuid and ci.active`) as unknown as Promise<OwnRow[]>,
    db.execute(sql`
      select up.equipment_snapshot as snap, coalesce((up.options->>'isDefault')::boolean, false) as is_default
        from characters c left join user_profiles up on up.id = c.active_profile_id
       where c.server_id = ${serverId} and c.user_id = ${userId}::uuid`) as unknown as Promise<{ snap: unknown; is_default: boolean }[]>,
  ]);
  const snap = av && !av.is_default && av.snap && typeof av.snap === 'object' && typeof (av.snap as Record<string, unknown>).weaponKey === 'string' ? (av.snap as Record<string, unknown>) : null;
  const pieces: LoadoutPiece[] = [];
  let changed = false;
  for (const slot of WEAK_SLOTS) {
    let best: { r: OwnRow; v: number } | null = null;
    for (const r of rows) {
      if (r.slot !== slot) continue;
      const cp = pieceCombatPower(Number(r.el), Number(r.tl));
      const v = piecePower(cp, !!snap && snap[`${slot}Key`] === r.code, !!snap, known.has(r.code));
      // 같으면 지금 장착을 유지(쓸데없이 바꾸지 않게).
      if (!best || v > best.v || (v === best.v && r.on_ && !best.r.on_)) best = { r, v };
    }
    if (!best) continue;
    if (!best.r.on_) changed = true;
    const r = best.r;
    pieces.push({ ueid: r.ueid, slot, code: r.code, name: r.name, cp: Math.round(pieceCombatPower(Number(r.el), Number(r.tl))), src: spritePath(r.code), av: !!snap && snap[`${slot}Key`] === r.code, weak: known.has(r.code) });
  }
  if (!changed) return null;
  const power = Math.round(pieces.reduce((s, p) => s + piecePower(p.cp, p.av, !!snap, p.weak), 0));
  return { ueids: pieces.map((p) => p.ueid), power, pieces };
}
