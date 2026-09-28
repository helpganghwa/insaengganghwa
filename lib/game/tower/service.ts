import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { TOWER_DAILY_ATTEMPTS, TOWER_FLOORS, TOWER_SECTION, pieceCombatPower, towerIsSpecial, towerRequirement, towerReward, towerSection } from '@/lib/game/balance';
import { walletAdd } from '@/lib/game/wallet';
import { kstDateString, kstWeekStartString } from '@/lib/kst';

import { simulateTowerBattle, type TowerTurn } from './battle';
import { TOWER_SLOTS, drawPool, floorRule, towerCp, type EquippedPiece, type FloorRule, type Rng10k, type SlotKeys, type TowerSlot } from './engine';

/** 서버 권위 RNG(CLAUDE §3.1). */
const cryptoRng10k: Rng10k = () => crypto.getRandomValues(new Uint32Array(1))[0]! % 10000;

export class TowerError extends Error {
  constructor(public code: 'NOT_NEXT_FLOOR' | 'NO_ATTEMPTS' | 'TOP_REACHED' | 'NO_CHARACTER' | 'BAD_AVATAR' | 'NO_POWER') {
    super(code);
    this.name = 'TowerError';
  }
}

type CatalogRow = { id: number; code: string; slot: TowerSlot; name: string };

async function activeCatalog(): Promise<CatalogRow[]> {
  return (await db.execute(sql`select id, code, slot::text as slot, name from catalog_items where active order by id`)) as unknown as CatalogRow[];
}

/** drizzle sql에 배열을 그대로 넘기면 (a, b, c) 튜플로 펼쳐진다 — ARRAY[...]::text[]로 조립. */
function textArray(xs: string[]) {
  return xs.length ? sql`array[${sql.join(xs.map((x) => sql`${x}`), sql`, `)}]::text[]` : sql`'{}'::text[]`;
}

function bySlot(rows: CatalogRow[]): SlotKeys {
  const out: SlotKeys = { weapon: [], armor: [], accessory: [] };
  for (const r of rows) out[r.slot]?.push(r.code);
  return out;
}

/**
 * 그 주 요구 장비(2구간부터) · 특별층 지정 장비를 보장하고 읽는다. 없으면 서버 RNG로 추첨해 insert(동시 첫 접근은
 * on conflict로 한 쪽만 남는다 — 먼저 박제된 것을 다시 읽으므로 모두 같은 풀을 본다).
 */
export async function towerPools(serverId: number, at: Date = new Date()): Promise<{ week: string; pools: Map<number, SlotKeys>; specials: Map<number, SlotKeys> }> {
  const week = kstWeekStartString(at);
  const sections = Math.ceil(TOWER_FLOORS / TOWER_SECTION);
  let [poolRows, spRows] = await Promise.all([
    db.execute(sql`select section, weapon, armor, accessory from tower_pools where server_id=${serverId} and week_start=${week}::date`) as unknown as Promise<
      { section: number; weapon: string[]; armor: string[]; accessory: string[] }[]
    >,
    db.execute(sql`select section, weapon, armor, accessory from tower_specials where server_id=${serverId}`) as unknown as Promise<
      { section: number; weapon: string; armor: string; accessory: string }[]
    >,
  ]);
  const needPools = poolRows.length < sections - 1;
  const needSp = spRows.length < sections;
  if (needPools || needSp) {
    const cat = bySlot(await activeCatalog());
    if (needPools) {
      for (let s = 2; s <= sections; s++) {
        const p = drawPool(cat, cryptoRng10k);
        await db.execute(sql`
          insert into tower_pools (server_id, week_start, section, weapon, armor, accessory)
          values (${serverId}, ${week}::date, ${s}, ${textArray(p.weapon)}, ${textArray(p.armor)}, ${textArray(p.accessory)})
          on conflict do nothing`);
      }
    }
    if (needSp) {
      for (let s = 1; s <= sections; s++) {
        const p = drawPool(cat, cryptoRng10k, 1);
        await db.execute(sql`
          insert into tower_specials (server_id, section, weapon, armor, accessory)
          values (${serverId}, ${s}, ${p.weapon[0]!}, ${p.armor[0]!}, ${p.accessory[0]!})
          on conflict do nothing`);
      }
    }
    [poolRows, spRows] = await Promise.all([
      db.execute(sql`select section, weapon, armor, accessory from tower_pools where server_id=${serverId} and week_start=${week}::date`) as unknown as Promise<typeof poolRows>,
      db.execute(sql`select section, weapon, armor, accessory from tower_specials where server_id=${serverId}`) as unknown as Promise<typeof spRows>,
    ]);
  }
  return {
    week,
    pools: new Map(poolRows.map((r) => [Number(r.section), { weapon: r.weapon, armor: r.armor, accessory: r.accessory }])),
    specials: new Map(spRows.map((r) => [Number(r.section), { weapon: [r.weapon], armor: [r.armor], accessory: [r.accessory] }])),
  };
}

export function ruleFor(floor: number, pools: Map<number, SlotKeys>, specials: Map<number, SlotKeys>): FloorRule {
  const s = towerSection(floor);
  return floorRule(floor, pools.get(s) ?? null, specials.get(s) ?? null);
}

export type TowerOwnedItem = { ueid: string; key: string; name: string; slot: TowerSlot; level: number; transcend: number; cp: number; equipped: boolean };
export type TowerAvatar = { id: string; south: string | null; keys: string[]; isDefault: boolean };

/** 오늘 남은 도전 — loss_day가 오늘(KST)이 아니면 가득. */
function attemptsLeft(lossDay: string | null, losses: number, at: Date = new Date()): number {
  return lossDay === kstDateString(at) ? Math.max(0, TOWER_DAILY_ATTEMPTS - losses) : TOWER_DAILY_ATTEMPTS;
}

export async function towerBoard(userId: string, serverId: number) {
  const [{ pools, specials, week }, prog, owned, avatars, ranks, catalog] = await Promise.all([
    towerPools(serverId),
    db.execute(sql`
      select best_floor, best_at, loss_day::text as loss_day, losses, last_profile_id::text as last_profile_id
      from tower_progress where user_id=${userId}::uuid and server_id=${serverId}`) as unknown as Promise<
      { best_floor: number; best_at: string | null; loss_day: string | null; losses: number; last_profile_id: string | null }[]
    >,
    db.execute(sql`
      select ue.id::text as ueid, ci.code as key, ci.name, ci.slot::text as slot, ue.enhance_level as level,
             ue.transcend_level as transcend, ue.equipped_slot is not null as equipped
      from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
      where ue.user_id=${userId}::uuid and ue.server_id=${serverId} and ci.active`) as unknown as Promise<
      { ueid: string; key: string; name: string; slot: TowerSlot; level: number; transcend: number; equipped: boolean }[]
    >,
    db.execute(sql`
      select up.id::text as id, up.rotations->>'south' as south, up.equipment_snapshot,
             coalesce((up.options->>'isDefault')::boolean, false) as is_default
      from user_profiles up where up.user_id=${userId}::uuid and up.server_id=${serverId}
      order by is_default desc, up.created_at desc`) as unknown as Promise<
      { id: string; south: string | null; equipment_snapshot: unknown; is_default: boolean }[]
    >,
    db.execute(sql`
      select tp.user_id::text as user_id, c.nickname, tp.best_floor, tp.best_at
      from tower_progress tp join characters c on c.user_id = tp.user_id and c.server_id = tp.server_id
      where tp.server_id=${serverId} and tp.best_floor > 0
      order by tp.best_floor desc, tp.best_at asc limit 20`) as unknown as Promise<
      { user_id: string; nickname: string; best_floor: number; best_at: string }[]
    >,
    activeCatalog(),
  ]);
  const p = prog[0];
  const best = Number(p?.best_floor ?? 0);
  const items: TowerOwnedItem[] = owned.map((o) => ({
    ...o,
    level: Number(o.level),
    transcend: Number(o.transcend),
    cp: pieceCombatPower(Number(o.level), Number(o.transcend)),
  }));
  const av: TowerAvatar[] = avatars.map((a) => {
    const snap = (a.equipment_snapshot && typeof a.equipment_snapshot === 'object' ? a.equipment_snapshot : {}) as Record<string, unknown>;
    const keys = a.is_default ? [] : ['weaponKey', 'armorKey', 'accessoryKey'].map((k) => snap[k]).filter((v): v is string => typeof v === 'string');
    return { id: a.id, south: a.south, keys, isDefault: a.is_default };
  });
  // 서버 돌파 수 — 그 층 이상 도달한 사람 수(층 목록 정보 영역). 지금 구간 + 다음 구간.
  const from = Math.max(1, (towerSection(best + 1) - 1) * TOWER_SECTION + 1);
  const clears = (await db.execute(sql`
    select f::int as floor, (select count(*)::int from tower_progress t where t.server_id=${serverId} and t.best_floor >= f) as n
    from generate_series(${from}::int, ${Math.min(TOWER_FLOORS, from + 2 * TOWER_SECTION - 1)}::int) f`)) as unknown as { floor: number; n: number }[];
  const [myRank] = best > 0
    ? ((await db.execute(sql`
        select (count(*) + 1)::int as r from tower_progress t
        where t.server_id=${serverId} and (t.best_floor > ${best} or (t.best_floor = ${best} and t.best_at < ${p!.best_at}::timestamptz))`)) as unknown as { r: number }[])
    : [];
  return {
    week,
    best,
    bestAt: p?.best_at ?? null,
    attemptsLeft: attemptsLeft(p?.loss_day ?? null, Number(p?.losses ?? 0)),
    lastProfileId: p?.last_profile_id ?? null,
    items,
    avatars: av,
    myCombatPower: items.reduce((a, i) => a + i.cp, 0),
    pools: Object.fromEntries(pools) as Record<number, SlotKeys>,
    specials: Object.fromEntries(specials) as Record<number, SlotKeys>,
    clears: Object.fromEntries(clears.map((c) => [c.floor, c.n])) as Record<number, number>,
    ranking: ranks.map((r) => ({ userId: r.user_id, nickname: r.nickname, floor: Number(r.best_floor), at: r.best_at })),
    myRank: myRank?.r ?? null,
    /** 활성 카탈로그 key → 이름·부위 — 요구 장비 중 없는 장비도 이름을 보여 준다. */
    catalog: Object.fromEntries(catalog.map((c) => [c.code, { name: c.name, slot: c.slot }])) as Record<string, { name: string; slot: TowerSlot }>,
  };
}
export type TowerBoard = Awaited<ReturnType<typeof towerBoard>>;

export type TowerChallengeResult = {
  battleId: string;
  floor: number;
  win: boolean;
  keyTurn: number;
  turns: TowerTurn[];
  reward: { diamond: number; boxes: number } | null;
  attemptsLeft: number;
  best: number;
};

/**
 * 도전 — 진행도 행을 잠그고(동시 도전·중복 보상 차단) 지금 층·남은 도전을 검사, 서버에서 전투를 판정한다.
 * 이기면 최고 층 갱신 + 첫 돌파 보상(지금 층만 도전 가능하므로 항상 첫 돌파), 지면 오늘 진 횟수 +1.
 */
export async function challengeTower(userId: string, serverId: number, floor: number, profileId: string | null, rng: Rng10k = cryptoRng10k): Promise<TowerChallengeResult> {
  const { pools, specials } = await towerPools(serverId);
  return db.transaction(async (tx) => {
    const ch = (await tx.execute(sql`select 1 from characters where user_id=${userId}::uuid and server_id=${serverId}`)) as unknown as unknown[];
    if (!ch.length) throw new TowerError('NO_CHARACTER');
    await tx.execute(sql`insert into tower_progress (user_id, server_id) values (${userId}::uuid, ${serverId}) on conflict do nothing`);
    const [p] = (await tx.execute(sql`
      select best_floor, loss_day::text as loss_day, losses from tower_progress
      where user_id=${userId}::uuid and server_id=${serverId} for update`)) as unknown as { best_floor: number; loss_day: string | null; losses: number }[];
    const best = Number(p!.best_floor);
    if (best >= TOWER_FLOORS) throw new TowerError('TOP_REACHED');
    if (floor !== best + 1) throw new TowerError('NOT_NEXT_FLOOR');
    const left = attemptsLeft(p!.loss_day, Number(p!.losses));
    if (left <= 0) throw new TowerError('NO_ATTEMPTS');

    let keys = new Set<string>();
    if (profileId) {
      const [a] = (await tx.execute(sql`
        select equipment_snapshot, coalesce((options->>'isDefault')::boolean, false) as is_default
        from user_profiles where id=${profileId}::uuid and user_id=${userId}::uuid and server_id=${serverId}`)) as unknown as { equipment_snapshot: unknown; is_default: boolean }[];
      if (!a) throw new TowerError('BAD_AVATAR');
      if (!a.is_default && a.equipment_snapshot && typeof a.equipment_snapshot === 'object') {
        const s = a.equipment_snapshot as Record<string, unknown>;
        keys = new Set(['weaponKey', 'armorKey', 'accessoryKey'].map((k) => s[k]).filter((v): v is string => typeof v === 'string'));
      }
    }
    const eqRows = (await tx.execute(sql`
      select ci.code as key, ci.slot::text as slot, ue.enhance_level as level, ue.transcend_level as transcend
      from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
      where ue.user_id=${userId}::uuid and ue.server_id=${serverId} and ue.equipped_slot is not null`)) as unknown as { key: string; slot: TowerSlot; level: number; transcend: number }[];
    const eq: EquippedPiece[] = eqRows.map((r) => ({ slot: r.slot, key: r.key, cp: pieceCombatPower(Number(r.level), Number(r.transcend)) }));
    const rule = ruleFor(floor, pools, specials);
    const cp = towerCp(eq, rule, keys);
    // 탑 전투력 0(요구 장비를 하나도 장착하지 않음) — 한 턴 만에 지고 도전만 날아가니 막는다.
    if (cp.total <= 0) throw new TowerError('NO_POWER');
    const req = towerRequirement(floor);
    const battle = simulateTowerBattle({ towerCp: cp.total, requirement: req, doubledCount: cp.doubledCount, rng });

    let reward: { diamond: number; boxes: number } | null = null;
    let newLeft = left;
    if (battle.win) {
      reward = towerReward(floor);
      await tx.execute(sql`
        update tower_progress set best_floor=${floor}, best_at=now(), last_profile_id=${profileId}::uuid, updated_at=now()
        where user_id=${userId}::uuid and server_id=${serverId}`);
    } else {
      const today = kstDateString();
      await tx.execute(sql`
        update tower_progress set
          losses = case when loss_day = ${today}::date then losses + 1 else 1 end,
          loss_day = ${today}::date, last_profile_id=${profileId}::uuid, updated_at=now()
        where user_id=${userId}::uuid and server_id=${serverId}`);
      newLeft = left - 1;
    }
    const [row] = (await tx.execute(sql`
      insert into tower_battles (user_id, server_id, floor, win, tower_cp, requirement, profile_id, pieces, turns, key_turn, reward)
      values (${userId}::uuid, ${serverId}, ${floor}, ${battle.win}, ${cp.total}, ${req}, ${profileId}::uuid,
              ${JSON.stringify(cp.pieces)}::jsonb, ${JSON.stringify(battle.turns)}::jsonb, ${battle.keyTurn}, ${reward ? JSON.stringify(reward) : null}::jsonb)
      returning id::text as id`)) as unknown as { id: string }[];
    if (reward) {
      if (reward.diamond > 0) await walletAdd(tx, userId, serverId, reward.diamond, 'tower', `tower:${floor}`);
      if (reward.boxes > 0) {
        const per = Math.floor(reward.boxes / 3);
        for (const slot of TOWER_SLOTS) {
          await tx.execute(sql`
            insert into user_supply_boxes (user_id, server_id, slot, count) values (${userId}::uuid, ${serverId}, ${slot}, ${per})
            on conflict (user_id, server_id, slot) do update set count = user_supply_boxes.count + ${per}`);
        }
      }
    }
    return { battleId: row!.id, floor, win: battle.win, keyTurn: battle.keyTurn, turns: battle.turns, reward, attemptsLeft: newLeft, best: battle.win ? floor : best };
  });
}

/** 다시 보기 — 내 전투만. */
export async function towerBattle(userId: string, serverId: number, id: string) {
  if (!/^\d+$/.test(id)) return null;
  const [b] = (await db.execute(sql`
    select id::text as id, floor, win, tower_cp, requirement, profile_id::text as profile_id, pieces, turns, key_turn, reward,
           (select up.rotations->>'south' from user_profiles up where up.id = tb.profile_id) as south
    from tower_battles tb where id=${id}::bigint and user_id=${userId}::uuid and server_id=${serverId}`)) as unknown as {
    id: string; floor: number; win: boolean; tower_cp: number; requirement: number; profile_id: string | null;
    pieces: unknown; turns: TowerTurn[]; key_turn: number; reward: { diamond: number; boxes: number } | null; south: string | null;
  }[];
  return b ?? null;
}

export { towerIsSpecial };
