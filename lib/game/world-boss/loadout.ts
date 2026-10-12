import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { pieceCombatPower } from '@/lib/game/balance';
import { WORLD_BOSS_WEAK_BONUS } from '@/lib/game/guild/balance';
import { spritePath } from '@/lib/game/equipment/sprite-manifest';

import { type BestAvatar, type BestPiece, avatarKeysOf, pickBestLoadout } from './best-loadout';
import { WEAK_SLOTS, type WeakSlot, piecePower } from './weak';

/**
 * 월드보스 장착 상태(docs/WORLD-BOSS.md §3) — 화면용 읽기. 전투 판정은 출발 트랜잭션(party.ts)이 따로 한다.
 * 화면에서 쓰는 "약점"은 **공개된 약점만**이다(공개 전 약점은 아무도 모른다).
 */
export type LoadoutPiece = { ueid: string; slot: WeakSlot; code: string; name: string; cp: number; level: number; transcend: number; src: string | null; av: boolean; weak: boolean };
/** 대표 아바타를 만들 때 입은 장비 한 칸 — on = 지금 그 부위에 같은 장비를 장착(탑 '아바타' 줄과 같은 표시, 10-11 T1). */
export type AvatarGear = { slot: WeakSlot; code: string; src: string | null; on: boolean };
export type Loadout = { pieces: LoadoutPiece[]; hasAvatar: boolean; avatarGear: AvatarGear[]; power: number; weakCount: number; avatarCount: number };
export type KnownWeak = { code: string; slot: WeakSlot; name: string; src: string | null };

type EqRow = { uid: string; ueid: string; code: string; name: string; slot: string; el: number; tl: number };
type OwnRow = { ueid: string; code: string; name: string; slot: string; el: number; tl: number; on_: boolean };

const isSlot = (s: string): s is WeakSlot => s === 'weapon' || s === 'armor' || s === 'accessory';

export { piecePower }; // 순수 식은 weak.ts(화면 WeakPanel도 같은 함수를 쓴다)

/** 이 보스에서 공개된 약점(이름·그림). 묶음이 하나라 phase는 늘 0(10-11). 처음 맞힌 대원은 표(finder_*)에만 남고 화면엔 내지 않는다(10-10 사용자 결정). */
export async function knownWeakOf(bossId: string): Promise<KnownWeak[]> {
  const rows = (await db.execute(sql`
    select r.code, r.slot, coalesce(ci.name, r.code) as name
      from world_boss_weak_reveals r left join catalog_items ci on ci.code = r.code
     where r.boss_id = ${bossId}::bigint and r.phase = 0
     order by case r.slot when 'weapon' then 0 when 'armor' then 1 else 2 end, r.revealed_at`)) as unknown as { code: string; slot: string; name: string }[];
  return rows.filter((r) => isSlot(r.slot)).map((r) => ({ code: r.code, slot: r.slot as WeakSlot, name: r.name, src: spritePath(r.code) }));
}

/** 사람들의 장착 상태(장착 3개 + 대표 아바타) — 공개된 약점 기준 전투력. */
export async function loadoutsOf(serverId: number, userIds: string[], known: ReadonlySet<string>, weakBonus: number = WORLD_BOSS_WEAK_BONUS): Promise<Map<string, Loadout>> {
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
      .map((r) => ({ ueid: r.ueid, slot: r.slot as WeakSlot, code: r.code, name: r.name, cp: Math.round(pieceCombatPower(Number(r.el), Number(r.tl))), level: Number(r.el), transcend: Number(r.tl), src: spritePath(r.code), av: !!snap && snap[`${r.slot}Key`] === r.code, weak: known.has(r.code) }))
      .sort((a, b) => WEAK_SLOTS.indexOf(a.slot) - WEAK_SLOTS.indexOf(b.slot));
    const power = Math.round(pieces.reduce((s, p) => s + piecePower(p.cp, p.av, !!snap, p.weak, weakBonus), 0));
    const avatarGear: AvatarGear[] = snap
      ? WEAK_SLOTS.flatMap((slot) => {
          const code = snap[`${slot}Key`];
          return typeof code === 'string' ? [{ slot, code, src: spritePath(code), on: pieces.some((p) => p.slot === slot && p.code === code) }] : [];
        })
      : [];
    out.set(uid, { pieces, hasAvatar: !!snap, avatarGear, power, weakCount: pieces.filter((p) => p.weak).length, avatarCount: pieces.filter((p) => p.av || (!!snap && p.weak)).length });
  }
  return out;
}

/** 추천 조합 — "추천 장비 장착"의 제안. avatarId = 바꿀 대표 아바타(지금 대표 그대로면 null), avatar = 조합의 아바타(보너스 없음이면 null). */
export type BestLoadout = {
  ueids: string[];
  avatarId: string | null;
  avatar: { id: string; src: string | null; gear: AvatarGear[] } | null;
  hasAvatar: boolean;
  power: number;
  pieces: LoadoutPiece[];
};

/**
 * 가진 장비와 보유 아바타 전부를 후보로 공개된 약점·아바타 보너스까지 계산한 가장 좋은 조합(장비 3개 + 대표 아바타) — "추천 장비 장착" 버튼의 제안.
 * 무한의 탑 자동 장착과 같은 규칙(best-loadout.ts, 10-12). 지금 장착·대표와 같으면 null.
 */
export async function bestLoadoutOf(serverId: number, userId: string, known: ReadonlySet<string>, weakBonus: number = WORLD_BOSS_WEAK_BONUS): Promise<BestLoadout | null> {
  const [rows, avRows] = await Promise.all([
    db.execute(sql`
      select ue.id::text as ueid, ci.code, ci.name, ci.slot::text as slot, ue.enhance_level as el, ue.transcend_level as tl, ue.equipped_slot is not null as on_
        from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
       where ue.server_id = ${serverId} and ue.user_id = ${userId}::uuid`) as unknown as Promise<OwnRow[]>, // 비활성(교체된 옛) 장비도 후보 — 출발 전투력과 같은 기준(10-11 3차)
    // 보유 아바타 전부(서버별 자산) + 지금 대표 표시. 아바타가 없는 캐릭터는 id가 null인 한 행.
    db.execute(sql`
      select up.id::text as id, up.rotations->>'south' as south, up.equipment_snapshot as snap,
             coalesce((up.options->>'isDefault')::boolean, false) as is_default, (up.id = c.active_profile_id) as active
        from characters c left join user_profiles up on up.user_id = c.user_id and up.server_id = c.server_id
       where c.server_id = ${serverId} and c.user_id = ${userId}::uuid
       order by (up.id = c.active_profile_id) desc nulls last, up.created_at`) as unknown as Promise<{ id: string | null; south: string | null; snap: unknown; is_default: boolean; active: boolean | null }[]>,
  ]);
  // cp는 loadoutsOf와 같이 먼저 반올림 — 제안 전투력과 지금 전투력을 같은 자리에서 비교한다.
  const pieces: BestPiece[] = rows.filter((r) => isSlot(r.slot)).map((r) => ({ ueid: r.ueid, slot: r.slot as WeakSlot, code: r.code, cp: Math.round(pieceCombatPower(Number(r.el), Number(r.tl))), on: r.on_ }));
  const customs = avRows.flatMap((r) => {
    const keys = r.id && !r.is_default ? avatarKeysOf(r.snap) : null;
    return r.id && keys ? [{ id: r.id, keys, active: !!r.active, south: r.south }] : [];
  });
  // 지금 대표가 없거나 기본 아바타면 '그대로(보너스 없음)'를 후보에 넣어 바꾸지 않는 선택지를 남긴다.
  const cands: BestAvatar[] = customs.some((a) => a.active) ? customs : [{ id: null, keys: null, active: true }, ...customs];
  const plan = pickBestLoadout(pieces, cands, known, weakBonus);
  if (!plan.changed) return null;
  const keys = plan.avatar.keys;
  const byUeid = new Map(rows.map((r) => [r.ueid, r] as const));
  const out: LoadoutPiece[] = WEAK_SLOTS.flatMap((slot) => {
    const p = plan.picks[slot];
    const r = p && byUeid.get(p.ueid);
    return p && r ? [{ ueid: p.ueid, slot, code: p.code, name: r.name, cp: p.cp, level: Number(r.el), transcend: Number(r.tl), src: spritePath(p.code), av: !!keys && keys[slot] === p.code, weak: known.has(p.code) }] : [];
  });
  const chosen = keys ? customs.find((a) => a.id === plan.avatar.id) : undefined;
  return {
    ueids: out.filter((p) => !plan.picks[p.slot]!.on).map((p) => p.ueid),
    avatarId: plan.avatar.active ? null : plan.avatar.id,
    avatar:
      chosen && keys
        ? {
            id: chosen.id,
            src: chosen.south,
            gear: WEAK_SLOTS.flatMap((slot) => {
              const code = keys[slot];
              return code ? [{ slot, code, src: spritePath(code), on: plan.picks[slot]?.code === code }] : [];
            }),
          }
        : null,
    hasAvatar: !!keys,
    power: Math.round(plan.power),
    pieces: out,
  };
}
