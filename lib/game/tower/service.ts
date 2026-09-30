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

/** 정지 중 계정 제외(리더보드 activeBannedIds와 같은 술어) — pr = profiles 별칭. */
const NOT_BANNED = sql`not (pr.banned_at is not null and (pr.ban_until is null or pr.ban_until > now()))`;

export class TowerError extends Error {
  constructor(public code: 'NOT_NEXT_FLOOR' | 'NO_ATTEMPTS' | 'TOP_REACHED' | 'NO_CHARACTER' | 'BAD_AVATAR' | 'NO_POWER' | 'POOL_CHANGED') {
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

/** 요구 장비를 층마다 뽑는 층 — 1구간(1~10층)은 모든 장비라 11층부터. */
const POOL_FLOORS = Array.from({ length: TOWER_FLOORS - TOWER_SECTION }, (_, i) => TOWER_SECTION + 1 + i);

/**
 * 그 주 층별 요구 장비(11층부터) · 특별층 지정 장비(구간마다)를 보장하고 읽는다. 없으면 서버 RNG로 추첨해 insert(동시 첫 접근은
 * on conflict로 한 쪽만 남는다 — 먼저 박제된 것을 다시 읽으므로 모두 같은 풀을 본다). 층별 풀은 한 번의 insert로(90층 왕복 없이).
 */
export async function towerPools(serverId: number, at: Date = new Date()): Promise<{ week: string; pools: Map<number, SlotKeys>; specials: Map<number, SlotKeys> }> {
  const week = kstWeekStartString(at);
  const sections = Math.ceil(TOWER_FLOORS / TOWER_SECTION);
  const read = () =>
    Promise.all([
      db.execute(sql`select floor, weapon, armor, accessory from tower_pools where server_id=${serverId} and week_start=${week}::date`) as unknown as Promise<
        { floor: number; weapon: string[]; armor: string[]; accessory: string[] }[]
      >,
      db.execute(sql`select section, weapon, armor, accessory from tower_specials where server_id=${serverId}`) as unknown as Promise<
        { section: number; weapon: string; armor: string; accessory: string }[]
      >,
    ]);
  let [poolRows, spRows] = await read();
  const needPools = poolRows.length < POOL_FLOORS.length;
  const needSp = spRows.length < sections;
  if (needPools || needSp) {
    const cat = bySlot(await activeCatalog());
    if (needPools) {
      const have = new Set(poolRows.map((r) => Number(r.floor)));
      const rows = POOL_FLOORS.filter((f) => !have.has(f))
        .map((f) => ({ f, p: drawPool(cat, cryptoRng10k) }))
        .filter(({ p }) => p.weapon.length && p.armor.length && p.accessory.length); // 카탈로그 시드 전 — 풀 없이(×0) 둔다
      if (rows.length) {
        await db.execute(sql`
          insert into tower_pools (server_id, week_start, floor, weapon, armor, accessory)
          values ${sql.join(rows.map(({ f, p }) => sql`(${serverId}, ${week}::date, ${f}, ${textArray(p.weapon)}, ${textArray(p.armor)}, ${textArray(p.accessory)})`), sql`, `)}
          on conflict do nothing`);
      }
    }
    if (needSp) {
      for (let s = 1; s <= sections; s++) {
        const p = drawPool(cat, cryptoRng10k, 1);
        if (!p.weapon[0] || !p.armor[0] || !p.accessory[0]) continue;
        await db.execute(sql`
          insert into tower_specials (server_id, section, weapon, armor, accessory)
          values (${serverId}, ${s}, ${p.weapon[0]!}, ${p.armor[0]!}, ${p.accessory[0]!})
          on conflict do nothing`);
      }
    }
    [poolRows, spRows] = await read();
  }
  return {
    week,
    pools: new Map(poolRows.map((r) => [Number(r.floor), { weapon: r.weapon, armor: r.armor, accessory: r.accessory }])),
    specials: new Map(spRows.map((r) => [Number(r.section), { weapon: [r.weapon], armor: [r.armor], accessory: [r.accessory] }])),
  };
}

/** pools = 층별 요구 장비(층 → 부위별), specials = 구간별 특별층 지정 장비(구간 → 부위별). */
export function ruleFor(floor: number, pools: Map<number, SlotKeys>, specials: Map<number, SlotKeys>): FloorRule {
  return floorRule(floor, pools.get(floor) ?? null, specials.get(towerSection(floor)) ?? null);
}

export type TowerOwnedItem = { ueid: string; key: string; name: string; slot: TowerSlot; level: number; transcend: number; cp: number; equipped: boolean };
export type TowerAvatar = { id: string; south: string | null; keys: string[]; isDefault: boolean };

/** 오늘 남은 도전 — loss_day가 오늘(KST)이 아니면 가득. */
function attemptsLeft(lossDay: string | null, losses: number, at: Date = new Date()): number {
  return lossDay === kstDateString(at) ? Math.max(0, TOWER_DAILY_ATTEMPTS - losses) : TOWER_DAILY_ATTEMPTS;
}

/**
 * 탑 화면 데이터 — 한 번의 쿼리로(진행도·보유 장비·아바타·카탈로그·이번 주 요구 장비·지정 장비·내 순위).
 * 종전엔 7개 쿼리를 한꺼번에 병렬로 보내 레이아웃 쿼리와 겹치면 커넥션이 몰려, 풀러 쪽에서 쿼리가 멈춘 채
 * statement timeout(2분)까지 가는 일이 스테이징에서 반복됐다(돌파 뒤 다음 층 이동 오류). 요구 장비가 아직
 * 추첨되지 않은 주(그 주 첫 접근)만 towerPools로 추첨·저장한다.
 */
export async function towerBoard(userId: string, serverId: number) {
  const week = kstWeekStartString();
  const sections = Math.ceil(TOWER_FLOORS / TOWER_SECTION);
  const [row] = (await db.execute(sql`
    with me as (
      select best_floor, best_at, loss_day::text as loss_day, losses, last_profile_id::text as last_profile_id
      from tower_progress where user_id=${userId}::uuid and server_id=${serverId}
    )
    select
      (select row_to_json(me) from me) as prog,
      (select nickname from characters where user_id=${userId}::uuid and server_id=${serverId}) as nickname,
      (select json_build_object('name', g.name, 'emblemUrl', g.emblem_url) from guild_members gm join guilds g on g.id = gm.guild_id
        where gm.user_id=${userId}::uuid and gm.server_id=${serverId} limit 1) as guild,
      coalesce((select json_agg(o) from (
        select ue.id::text as ueid, ci.code as key, ci.name, ci.slot::text as slot, ue.enhance_level as level,
               ue.transcend_level as transcend, ue.equipped_slot is not null as equipped, ci.active
        from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
        where ue.user_id=${userId}::uuid and ue.server_id=${serverId}) o), '[]'::json) as owned,
      coalesce((select json_agg(a order by a.is_default desc, a.created_at desc) from (
        select up.id::text as id, up.rotations->>'south' as south, up.equipment_snapshot,
               coalesce((up.options->>'isDefault')::boolean, false) as is_default, up.created_at
        from user_profiles up where up.user_id=${userId}::uuid and up.server_id=${serverId}) a), '[]'::json) as avatars,
      coalesce((select json_agg(c order by c.id) from (select id, code, slot::text as slot, name from catalog_items where active) c), '[]'::json) as catalog,
      coalesce((select json_agg(p) from (select floor, weapon, armor, accessory from tower_pools
        where server_id=${serverId} and week_start=${week}::date) p), '[]'::json) as pools,
      coalesce((select json_agg(x) from (select section, weapon, armor, accessory from tower_specials where server_id=${serverId}) x), '[]'::json) as specials,
      (select (count(*) + 1)::int from tower_progress t join profiles pr on pr.id = t.user_id, me
        where me.best_floor > 0 and t.server_id=${serverId} and ${NOT_BANNED}
          -- 랭킹 표(rank-value.ts)와 같은 기준 — 도달 시각은 초 단위(같은 초면 같은 등수)
          and (t.best_floor > me.best_floor or (t.best_floor = me.best_floor
            and floor(extract(epoch from t.best_at)) < floor(extract(epoch from me.best_at))))) as my_rank,
      -- 돌파했지만 아직 받지 않은 층(목록의 돌파 보상 받기)
      coalesce((select json_agg(f order by f) from me, generate_series(1, me.best_floor) f
        where not exists (select 1 from tower_claims c where c.user_id=${userId}::uuid and c.server_id=${serverId} and c.floor = f)), '[]'::json) as unclaimed`)) as unknown as {
    prog: { best_floor: number; best_at: string | null; loss_day: string | null; losses: number; last_profile_id: string | null } | null;
    nickname: string | null;
    guild: { name: string; emblemUrl: string | null } | null;
    owned: { ueid: string; key: string; name: string; slot: TowerSlot; level: number; transcend: number; equipped: boolean; active: boolean }[];
    avatars: { id: string; south: string | null; equipment_snapshot: unknown; is_default: boolean }[];
    catalog: { code: string; slot: TowerSlot; name: string }[];
    pools: { floor: number; weapon: string[]; armor: string[]; accessory: string[] }[];
    specials: { section: number; weapon: string; armor: string; accessory: string }[];
    my_rank: number | null;
    unclaimed: number[];
  }[];
  const r = row!;
  // 그 주 첫 접근(아직 추첨 전)만 — 추첨·저장 후 다시 읽는다.
  const drawn = r.pools.length < POOL_FLOORS.length || r.specials.length < sections ? await towerPools(serverId) : null;
  const pools = drawn?.pools ?? new Map(r.pools.map((x) => [Number(x.floor), { weapon: x.weapon, armor: x.armor, accessory: x.accessory }]));
  const specials = drawn?.specials ?? new Map(r.specials.map((x) => [Number(x.section), { weapon: [x.weapon], armor: [x.armor], accessory: [x.accessory] }]));
  const p = r.prog;
  const best = Number(p?.best_floor ?? 0);
  const items: TowerOwnedItem[] = r.owned
    .filter((o) => o.active)
    .map((o) => ({
      ueid: o.ueid,
      key: o.key,
      name: o.name,
      slot: o.slot,
      equipped: o.equipped,
      level: Number(o.level),
      transcend: Number(o.transcend),
      cp: pieceCombatPower(Number(o.level), Number(o.transcend)),
    }));
  const av: TowerAvatar[] = r.avatars.map((a) => {
    const snap = (a.equipment_snapshot && typeof a.equipment_snapshot === 'object' ? a.equipment_snapshot : {}) as Record<string, unknown>;
    const keys = a.is_default ? [] : ['weaponKey', 'armorKey', 'accessoryKey'].map((k) => snap[k]).filter((v): v is string => typeof v === 'string');
    return { id: a.id, south: a.south, keys, isDefault: a.is_default };
  });
  return {
    week: drawn?.week ?? week,
    best,
    attemptsLeft: attemptsLeft(p?.loss_day ?? null, Number(p?.losses ?? 0)),
    lastProfileId: p?.last_profile_id ?? null,
    /** 무대 위 내 이름(대난투처럼 닉네임·길드). */
    nickname: r.nickname ?? '',
    guild: r.guild ?? null,
    items,
    avatars: av,
    pools: Object.fromEntries(pools) as Record<number, SlotKeys>,
    specials: Object.fromEntries(specials) as Record<number, SlotKeys>,
    myRank: best > 0 && r.my_rank != null ? Number(r.my_rank) : null,
    /** 돌파했지만 아직 받지 않은 층(오름차순). */
    unclaimed: r.unclaimed.map(Number),
    /** 활성 카탈로그 key → 이름·부위 — 요구 장비 중 없는 장비도 이름을 보여 준다. */
    catalog: Object.fromEntries(r.catalog.map((c) => [c.code, { name: c.name, slot: c.slot }])) as Record<string, { name: string; slot: TowerSlot }>,
  };
}
export type TowerBoard = Awaited<ReturnType<typeof towerBoard>>;

export type TowerChallengeResult = {
  battleId: string;
  floor: number;
  win: boolean;
  keyIndex: number;
  turns: TowerTurn[];
  reward: { diamond: number; boxes: number } | null;
  attemptsLeft: number;
  best: number;
  /** 서버가 실제로 싸운 탑 전투력·배율(×1 기준 대비) — 전투·실패 화면은 이 값을 그대로 보여 준다. */
  towerCp: number;
  mult: number;
};

type BattleRow = { id: string; floor: number; win: boolean; tower_cp: number; turns: TowerTurn[]; key_turn: number; reward: { diamond: number; boxes: number } | null; base_cp: number | null };

/**
 * 도전 — 진행도 행을 잠그고(동시 도전·중복 보상 차단) 지금 층·남은 도전을 검사, 서버에서 전투를 판정한다.
 * 이기면 최고 층 갱신, 지면 오늘 진 횟수 +1. 돌파 보상은 여기서 주지 않는다 — 목록에서 따로 받는다(claimTowerRewards).
 * reward = 그 층의 돌파 보상(받을 보상 안내용, 지급 기록 아님).
 * idemKey — 같은 키로 다시 오면(재전송) 저장된 결과를 돌려준다(CLAUDE §3.4). week — 화면이 본 주가 지금 주와 다르면
 * (월요일 0시를 넘겨 화면을 열어 둔 채 도전) 도전을 빼지 않고 POOL_CHANGED.
 */
export async function challengeTower(
  userId: string,
  serverId: number,
  floor: number,
  profileId: string | null,
  opts: { idemKey?: string | null; week?: string | null; rng?: Rng10k } = {},
): Promise<TowerChallengeResult> {
  const rng = opts.rng ?? cryptoRng10k;
  const { pools, specials, week } = await towerPools(serverId);
  if (opts.week && opts.week !== week) throw new TowerError('POOL_CHANGED');
  const idem = opts.idemKey && /^[A-Za-z0-9-]{8,64}$/.test(opts.idemKey) ? opts.idemKey : null;
  return db.transaction(async (tx) => {
    const ch = (await tx.execute(sql`select 1 from characters where user_id=${userId}::uuid and server_id=${serverId}`)) as unknown as unknown[];
    if (!ch.length) throw new TowerError('NO_CHARACTER');
    await tx.execute(sql`insert into tower_progress (user_id, server_id) values (${userId}::uuid, ${serverId}) on conflict do nothing`);
    const [p] = (await tx.execute(sql`
      select best_floor, loss_day::text as loss_day, losses from tower_progress
      where user_id=${userId}::uuid and server_id=${serverId} for update`)) as unknown as { best_floor: number; loss_day: string | null; losses: number }[];
    const best = Number(p!.best_floor);
    if (idem) {
      // 행 락 뒤에 찾으므로 같은 키의 동시 요청도 앞선 결과를 본다.
      const [prev] = (await tx.execute(sql`
        select id::text as id, floor, win, tower_cp, turns, key_turn, reward, (pieces->0->>'base')::int as base_cp
        from tower_battles where user_id=${userId}::uuid and idem_key=${idem}`)) as unknown as BattleRow[];
      if (prev) {
        const left = attemptsLeft(p!.loss_day, Number(p!.losses));
        return {
          battleId: prev.id, floor: Number(prev.floor), win: prev.win, keyIndex: Number(prev.key_turn), turns: prev.turns,
          reward: prev.reward, attemptsLeft: left, best, towerCp: Number(prev.tower_cp),
          mult: prev.base_cp ? Math.round((Number(prev.tower_cp) / prev.base_cp) * 100) / 100 : 1,
        };
      }
    }
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
    // 활성 장비만 — 화면(towerBoard)과 같은 기준. 퇴역 장비는 요구 장비가 될 수 없다.
    const eqRows = (await tx.execute(sql`
      select ci.code as key, ci.slot::text as slot, ue.enhance_level as level, ue.transcend_level as transcend
      from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
      where ue.user_id=${userId}::uuid and ue.server_id=${serverId} and ue.equipped_slot is not null and ci.active`)) as unknown as { key: string; slot: TowerSlot; level: number; transcend: number }[];
    const eq: EquippedPiece[] = eqRows.map((r) => ({ slot: r.slot, key: r.key, cp: pieceCombatPower(Number(r.level), Number(r.transcend)) }));
    const rule = ruleFor(floor, pools, specials);
    const cp = towerCp(eq, rule, keys);
    const base = towerCp(eq, rule, new Set()).total;
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
    const pieces = cp.pieces.map((x, i) => (i === 0 ? { ...x, base } : x));
    const [row] = (await tx.execute(sql`
      insert into tower_battles (user_id, server_id, floor, win, tower_cp, requirement, profile_id, pieces, turns, key_turn, reward, idem_key)
      values (${userId}::uuid, ${serverId}, ${floor}, ${battle.win}, ${cp.total}, ${req}, ${profileId}::uuid,
              ${JSON.stringify(pieces)}::jsonb, ${JSON.stringify(battle.turns)}::jsonb, ${battle.keyIndex}, ${reward ? JSON.stringify(reward) : null}::jsonb, ${idem})
      returning id::text as id`)) as unknown as { id: string }[];
    return {
      battleId: row!.id, floor, win: battle.win, keyIndex: battle.keyIndex, turns: battle.turns, reward,
      attemptsLeft: newLeft, best: battle.win ? floor : best, towerCp: cp.total, mult: base > 0 ? Math.round((cp.total / base) * 100) / 100 : 1,
    };
  });
}

/**
 * 돌파 보상 받기 — floors = 받을 층(null이면 받을 수 있는 층 전부). 진행도 행을 잠그고 돌파한 층(best_floor 이하)만,
 * tower_claims에 넣은 층만 지급한다(기본 키 충돌 = 이미 받음 → 건너뜀, 이중 수령 없음). 다이아는 한 번에 합쳐 원장 1줄.
 */
export async function claimTowerRewards(userId: string, serverId: number, floors: number[] | null): Promise<{ floors: number[]; diamond: number; boxes: number }> {
  return db.transaction(async (tx) => {
    const [p] = (await tx.execute(sql`
      select best_floor from tower_progress where user_id=${userId}::uuid and server_id=${serverId} for update`)) as unknown as { best_floor: number }[];
    const best = Number(p?.best_floor ?? 0);
    const want = floors === null
      ? Array.from({ length: best }, (_, i) => i + 1)
      : [...new Set(floors.map((f) => Math.floor(Number(f))))].filter((f) => f >= 1 && f <= best);
    if (!want.length) return { floors: [], diamond: 0, boxes: 0 };
    const got = (await tx.execute(sql`
      insert into tower_claims (user_id, server_id, floor)
      select ${userId}::uuid, ${serverId}, f from unnest(${sql`array[${sql.join(want.map((f) => sql`${f}`), sql`, `)}]::int[]`}) f
      on conflict do nothing
      returning floor`)) as unknown as { floor: number }[];
    const done = got.map((g) => Number(g.floor)).sort((a, b) => a - b);
    let diamond = 0;
    let boxes = 0;
    for (const f of done) {
      const r = towerReward(f);
      diamond += r.diamond;
      boxes += r.boxes;
    }
    if (diamond > 0) await walletAdd(tx, userId, serverId, diamond, 'tower', done.length === 1 ? `tower:${done[0]}` : `tower:${done[0]}-${done[done.length - 1]}x${done.length}`);
    if (boxes > 0) {
      const per = Math.floor(boxes / 3);
      for (const slot of TOWER_SLOTS) {
        await tx.execute(sql`
          insert into user_supply_boxes (user_id, server_id, slot, count) values (${userId}::uuid, ${serverId}, ${slot}, ${per})
          on conflict (user_id, server_id, slot) do update set count = user_supply_boxes.count + ${per}`);
      }
    }
    return { floors: done, diamond, boxes };
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
