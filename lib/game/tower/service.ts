import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { TOWER_DAILY_ATTEMPTS, TOWER_FLOORS, TOWER_POOL_PER_SLOT, TOWER_SECTION, TOWER_SPECIAL_POOL_PER_SLOT, pieceCombatPower, TOWER_HUNT_BOX_BP, TOWER_HUNT_DOUBLE_BP, towerHuntBox, towerHuntRange, towerIsSpecial, towerRequirement, towerReward } from '@/lib/game/balance';
import { walletAdd } from '@/lib/game/wallet';
import { extrasToday } from '@/lib/game/points/spend';
import { kstDateString, kstWeekStartString } from '@/lib/kst';

import { simulateTowerBattle, type TowerTurn } from './battle';
import { towerFloorSkills } from './floors';
import { towerRankValueSql } from './rank-value';
import { TOWER_SLOTS, drawPool, floorRule, towerCp, type EquippedPiece, type FloorRule, type Rng10k, type SlotKeys, type TowerSlot } from './engine';

/** 서버 권위 RNG(CLAUDE §3.1). */
const cryptoRng10k: Rng10k = () => crypto.getRandomValues(new Uint32Array(1))[0]! % 10000;


export class TowerError extends Error {
  constructor(public code: 'NOT_NEXT_FLOOR' | 'NOT_CLEARED' | 'NO_ATTEMPTS' | 'TOP_REACHED' | 'NO_CHARACTER' | 'BAD_AVATAR' | 'NO_POWER' | 'POOL_CHANGED' | 'POOL_MISSING') {
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
 * 그 주 층별 요구 장비(11층부터 — 일반 층 부위별 10개, 특별층 부위별 1개)를 보장하고 읽는다. 없으면 서버 RNG로 추첨해 insert(동시 첫 접근은
 * on conflict로 한 쪽만 남는다 — 먼저 박제된 것을 다시 읽으므로 모두 같은 풀을 본다). 층별 풀은 한 번의 insert로(90층 왕복 없이).
 */
export async function towerPools(serverId: number, at: Date = new Date()): Promise<{ week: string; pools: Map<number, SlotKeys> }> {
  const week = kstWeekStartString(at);
  const read = () =>
    db.execute(sql`select floor, weapon, armor, accessory from tower_pools where server_id=${serverId} and week_start=${week}::date`) as unknown as Promise<
      { floor: number; weapon: string[]; armor: string[]; accessory: string[] }[]
    >;
  let poolRows = await read();
  if (poolRows.length < POOL_FLOORS.length) {
    const cat = bySlot(await activeCatalog());
    const have = new Set(poolRows.map((r) => Number(r.floor)));
    const rows = POOL_FLOORS.filter((f) => !have.has(f))
      .map((f) => ({ f, p: drawPool(cat, cryptoRng10k, towerIsSpecial(f) ? TOWER_SPECIAL_POOL_PER_SLOT : TOWER_POOL_PER_SLOT) }))
      .filter(({ p }) => p.weapon.length && p.armor.length && p.accessory.length); // 카탈로그 시드 전 — 풀 없이(×0) 둔다
    if (rows.length) {
      await db.execute(sql`
        insert into tower_pools (server_id, week_start, floor, weapon, armor, accessory)
        values ${sql.join(rows.map(({ f, p }) => sql`(${serverId}, ${week}::date, ${f}, ${textArray(p.weapon)}, ${textArray(p.armor)}, ${textArray(p.accessory)})`), sql`, `)}
        on conflict do nothing`);
    }
    poolRows = await read();
  }
  return { week, pools: new Map(poolRows.map((r) => [Number(r.floor), { weapon: r.weapon, armor: r.armor, accessory: r.accessory }])) };
}

/**
 * 요구 장비 캐시 — 그 주 층별 풀은 한 번 박제되면 바뀌지 않아(재추첨 없음) 인스턴스 메모리에 둔다.
 * 도전마다 풀 조회를 없앤다. 다 뽑힌 상태만 담고(카탈로그 시드 전 등 빈 풀은 다시 읽는다), 주가 바뀌면 키가 달라진다.
 */
const poolCache = new Map<string, Awaited<ReturnType<typeof towerPools>>>();
const poolKey = (serverId: number, week: string = kstWeekStartString()) => `${serverId}:${week}`;
/** 다 뽑힌 풀만 캐시에 담는다(빈 풀은 다음에 다시 읽는다). towerBoard가 읽은 풀도 여기로 — 도전의 콜드 경로를 줄인다. */
function rememberPools(serverId: number, v: Awaited<ReturnType<typeof towerPools>>) {
  if (v.pools.size < POOL_FLOORS.length) return;
  if (poolCache.size > 16) poolCache.clear();
  poolCache.set(poolKey(serverId, v.week), v);
}
async function towerPoolsCached(serverId: number) {
  const hit = poolCache.get(poolKey(serverId));
  if (hit) return hit;
  const v = await towerPools(serverId);
  rememberPools(serverId, v);
  return v;
}

export function ruleFor(floor: number, pools: Map<number, SlotKeys>): FloorRule {
  return floorRule(floor, pools.get(floor) ?? null);
}

export type TowerOwnedItem = { ueid: string; key: string; name: string; slot: TowerSlot; level: number; transcend: number; cp: number; equipped: boolean };
export type TowerAvatar = { id: string; south: string | null; keys: string[]; isDefault: boolean };

/**
 * 오늘 남은 도전 — 하루 TOWER_DAILY_ATTEMPTS + 오늘 산 '탑 추가 도전'(10-06, POINT-SHOP §6) − 오늘 진 횟수.
 * loss_day가 오늘(KST)이 아니면 진 횟수는 0으로 본다. extra는 오늘 날짜로 읽은 값만 넘길 것.
 */
function attemptsLeft(lossDay: string | null, losses: number, extra = 0, at: Date = new Date()): number {
  const total = TOWER_DAILY_ATTEMPTS + extra;
  return lossDay === kstDateString(at) ? Math.max(0, total - losses) : total;
}

/**
 * '탑 추가 도전' 구매 전 검사(포인트 상점 트랜잭션 안에서) — 오늘 남은 도전이 0일 때만 산다(화면의 ＋도 이때만).
 * 진행도 행을 잠가 전투와 직렬화한다.
 */
export async function towerExtraCheck(tx: Tx, userId: string, serverId: number): Promise<'needed' | 'not_needed'> {
  const [p] = (await tx.execute(sql`
    select loss_day::text as loss_day, losses from tower_progress
    where user_id=${userId}::uuid and server_id=${serverId} for update`)) as unknown as { loss_day: string | null; losses: number }[];
  const extra = await extrasToday(tx, userId, serverId, 'tower');
  return attemptsLeft(p?.loss_day ?? null, Number(p?.losses ?? 0), extra) <= 0 ? 'needed' : 'not_needed';
}

/**
 * 탑 화면 데이터 — 한 번의 쿼리로(진행도·보유 장비·아바타·카탈로그·이번 주 요구 장비·내 순위).
 * 종전엔 7개 쿼리를 한꺼번에 병렬로 보내 레이아웃 쿼리와 겹치면 커넥션이 몰려, 풀러 쪽에서 쿼리가 멈춘 채
 * statement timeout(2분)까지 가는 일이 스테이징에서 반복됐다(돌파 뒤 다음 층 이동 오류). 요구 장비가 아직
 * 추첨되지 않은 주(그 주 첫 접근)만 towerPools로 추첨·저장한다.
 */
export async function towerBoard(userId: string, serverId: number) {
  const week = kstWeekStartString();
  const [row] = (await db.execute(sql`
    with me as (
      select best_floor, best_at, loss_day::text as loss_day, losses, last_profile_id::text as last_profile_id
      from tower_progress where user_id=${userId}::uuid and server_id=${serverId}
    )
    select
      (select row_to_json(me) from me) as prog,
      (select coalesce(sum(count), 0)::int from point_extra_buys where user_id=${userId}::uuid and server_id=${serverId}
        and kst_date=${kstDateString()}::date and item='tower') as extra,
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
      -- 요구 장비는 그 주 90층 전부(일부만 보내는 안은 10-01 롤백 — 화면 안에서 돌파해 다음 구간이 열리면 그 구간 풀이 없었다).
      coalesce((select json_agg(p) from (select floor, weapon, armor, accessory from tower_pools
        where server_id=${serverId} and week_start=${week}::date) p), '[]'::json) as pools,
      -- 내 순위 = 랭킹 표(leaderboard_ranks, 돌파 직후 증분 반영·매시 스냅샷)에서 내 값보다 큰 행 수 + 1 — 인덱스 한 번(10-01, 종전 전 유저 조인).
      -- 밴 유저는 밴 시점에 표에서 빠지고, 내 행이 아직 옛 값이어도 '나보다 큰 값'만 세므로 결과는 같다.
      (select (count(*) + 1)::int from leaderboard_ranks lr, me
        where me.best_floor > 0 and lr.server_id=${serverId} and lr.metric='tower'
          and lr.value > ${sql.raw(towerRankValueSql('me'))}) as my_rank,
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
    my_rank: number | null;
    unclaimed: number[];
    extra: number;
  }[];
  const r = row!;
  // 그 주 첫 접근(아직 추첨 전)만 — 추첨·저장 후 다시 읽는다.
  // 캐릭터가 없는 서버(쿠키 조작 등)면 추첨하지 않는다(감사 M2) — 화면은 page가 캐릭터 없음으로 처리.
  const drawn = r.nickname != null && r.pools.length < POOL_FLOORS.length ? await towerPools(serverId) : null;
  const pools = drawn?.pools ?? new Map(r.pools.map((x) => [Number(x.floor), { weapon: x.weapon, armor: x.armor, accessory: x.accessory }]));
  rememberPools(serverId, { week: drawn?.week ?? week, pools });
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
    attemptsLeft: attemptsLeft(p?.loss_day ?? null, Number(p?.losses ?? 0), Number(row?.extra ?? 0)),
    attemptsTotal: TOWER_DAILY_ATTEMPTS + Number(row?.extra ?? 0),
    extraBought: Number(row?.extra ?? 0),
    lastProfileId: p?.last_profile_id ?? null,
    /** 무대 위 내 이름(대난투처럼 닉네임·길드). */
    nickname: r.nickname ?? '',
    guild: r.guild ?? null,
    items,
    avatars: av,
    pools: Object.fromEntries(pools) as Record<number, SlotKeys>,
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
  /** 토벌은 실제 지급분 — double = 💎 더블이 터진 판(diamond는 이미 ×2), boxes = 상자가 터진 판의 상자 수. */
  reward: TowerBattleReward | null;
  attemptsLeft: number;
  best: number;
  /** 서버가 실제로 싸운 탑 전투력·배율(×1 기준 대비) — 전투·실패 화면은 이 값을 그대로 보여 준다. */
  towerCp: number;
  mult: number;
  /** 이긴 판의 서버 순위(목록 머리 줄) — 진 판·재전송은 null(그대로 둔다). */
  myRank: number | null;
  /** 같은 요청 키로 다시 와서 저장된 결과를 돌려준 경우 — 화면이 기록을 두 번 세지 않게. */
  replayed?: boolean;
  /** 토벌(돌파한 층 재도전) 판 — 이기면 reward.diamond를 그 자리에서 지급(목록 받기 없음), 최고 층·순위는 그대로. */
  hunt?: boolean;
  /** 토벌로 다이아가 들어온 뒤의 잔액(헤더 다이아를 맞춘다). 그 밖에는 null. */
  diamondBalance?: string | null;
};

export type TowerBattleReward = { diamond: number; boxes: number; double?: boolean };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type BattleRow = { id: string; floor: number; win: boolean; hunt: boolean | null; tower_cp: number; turns: TowerTurn[]; key_turn: number; reward: TowerBattleReward | null; base_cp: number | null };

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
  opts: { idemKey?: string | null; week?: string | null; rng?: Rng10k; hunt?: boolean; bonusRng?: Rng10k } = {},
): Promise<TowerChallengeResult> {
  const hunt = !!opts.hunt;
  const rng = opts.rng ?? cryptoRng10k;
  const idem = opts.idemKey && /^[A-Za-z0-9-]{8,64}$/.test(opts.idemKey) ? opts.idemKey : null;
  // 요구 장비는 트랜잭션 **밖**에서 — 진행도 행을 잠근 트랜잭션 안에서 풀 커넥션을 또 잡으면, 캐시가 빈 인스턴스에 도전이
  // 몰릴 때 커넥션이 서로를 기다려 풀 전체가 멈춘다(09-30 재검수 #1). 캐시에 없을 때만 캐릭터를 먼저 확인하고 추첨한다 —
  // 쿠키로 아무 서버 번호를 보내 없는 서버의 풀을 만들게 할 수 없게(감사 M2). tx에서 읽지 않는다(롤백되면 캐시가 어긋난다).
  let pw = poolCache.get(poolKey(serverId));
  if (!pw) {
    const ch = (await db.execute(sql`select 1 from characters where user_id=${userId}::uuid and server_id=${serverId}`)) as unknown as unknown[];
    if (!ch.length) throw new TowerError('NO_CHARACTER');
    pw = await towerPoolsCached(serverId);
  }
  const { pools, week } = pw;
  // 왕복 최소화(CLAUDE §11.4): ① 캐릭터 확인+진행도 생성+행 잠금 ② (재전송 확인) ③ 아바타+장착 ④ 진행도 갱신+전투 저장(+이기면 순위).
  return db.transaction(async (tx) => {
    // ① 캐릭터가 있을 때만 진행도 행을 만들고, 있든 없든 do update로 행을 잠근 채 돌려받는다(없으면 캐릭터 없음).
    const [p] = (await tx.execute(sql`
      insert into tower_progress (user_id, server_id)
      select ${userId}::uuid, ${serverId} where exists (select 1 from characters where user_id=${userId}::uuid and server_id=${serverId})
      on conflict (user_id, server_id) do update set server_id = excluded.server_id
      returning best_floor, loss_day::text as loss_day, losses`)) as unknown as { best_floor: number; loss_day: string | null; losses: number }[];
    if (!p) throw new TowerError('NO_CHARACTER');
    const best = Number(p.best_floor);
    const extra = await extrasToday(tx, userId, serverId, 'tower');
    if (idem) {
      // ② 행 잠금 뒤 새 문장으로 찾아야 같은 키의 동시 요청도 앞선 결과를 본다(같은 문장에 넣으면 잠금 전 스냅샷이라 못 본다).
      const [prev] = (await tx.execute(sql`
        select id::text as id, floor, win, hunt, tower_cp, turns, key_turn, reward, (pieces->0->>'base')::int as base_cp
        from tower_battles where user_id=${userId}::uuid and server_id=${serverId} and idem_key=${idem}`)) as unknown as BattleRow[];
      if (prev) {
        const left = attemptsLeft(p.loss_day, Number(p.losses), extra);
        // 토벌 승리의 재전송 — 전리품은 이미 들어갔으니 지금 잔액을 실어 헤더 다이아를 맞춘다(10-01).
        let diamondBalance: string | null = null;
        if (prev.hunt && prev.win) {
          const [c] = (await tx.execute(sql`select diamond::text as d from characters where user_id=${userId}::uuid and server_id=${serverId}`)) as unknown as { d: string }[];
          diamondBalance = c?.d ?? null;
        }
        return {
          battleId: prev.id, floor: Number(prev.floor), win: prev.win, keyIndex: Number(prev.key_turn), turns: prev.turns,
          reward: prev.reward, attemptsLeft: left, best, towerCp: Number(prev.tower_cp),
          mult: prev.base_cp ? Math.round((Number(prev.tower_cp) / prev.base_cp) * 100) / 100 : 1, myRank: null, replayed: true,
          hunt: !!prev.hunt, diamondBalance,
        };
      }
    }
    // 재전송 확인 뒤에 — 주 경계를 넘겨 다시 온 같은 도전도 저장된 결과를 받는다(재검수 #2).
    if (opts.week && opts.week !== week) throw new TowerError('POOL_CHANGED');
    // 그 주 풀이 다 뽑히지 않았으면(카탈로그 시드 전·추첨 실패) 도전 자체를 막는다 — 횟수는 빼지 않는다(감사 M1).
    if (pools.size < POOL_FLOORS.length) throw new TowerError('POOL_MISSING');
    if (hunt) {
      // 토벌 — 이미 돌파한 층만(그 주 요구 장비·스킬 그대로). 꼭대기까지 오른 뒤에도 할 수 있다.
      if (floor < 1 || floor > best) throw new TowerError('NOT_CLEARED');
    } else {
      if (best >= TOWER_FLOORS) throw new TowerError('TOP_REACHED');
      if (floor !== best + 1) throw new TowerError('NOT_NEXT_FLOOR');
    }
    const left = attemptsLeft(p.loss_day, Number(p.losses), extra);
    if (left <= 0) throw new TowerError('NO_ATTEMPTS');

    // ③ 고른 아바타 + 장착 장비(활성만 — 화면(towerBoard)과 같은 기준, 퇴역 장비는 요구 장비가 될 수 없다).
    const [g] = (await tx.execute(sql`
      select
        ${profileId ? sql`(select json_build_object('snap', equipment_snapshot, 'isDefault', coalesce((options->>'isDefault')::boolean, false))
          from user_profiles where id=${profileId}::uuid and user_id=${userId}::uuid and server_id=${serverId})` : sql`null`} as avatar,
        coalesce((select json_agg(e) from (
          select ci.code as key, ci.slot::text as slot, ue.enhance_level as level, ue.transcend_level as transcend
          from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
          where ue.user_id=${userId}::uuid and ue.server_id=${serverId} and ue.equipped_slot is not null and ci.active) e), '[]'::json) as eq`)) as unknown as {
      avatar: { snap: unknown; isDefault: boolean } | null;
      eq: { key: string; slot: TowerSlot; level: number; transcend: number }[];
    }[];
    let keys = new Set<string>();
    if (profileId) {
      if (!g!.avatar) throw new TowerError('BAD_AVATAR');
      const snap = g!.avatar.snap;
      if (!g!.avatar.isDefault && snap && typeof snap === 'object') {
        const s = snap as Record<string, unknown>;
        keys = new Set(['weaponKey', 'armorKey', 'accessoryKey'].map((k) => s[k]).filter((v): v is string => typeof v === 'string'));
      }
    }
    const eq: EquippedPiece[] = g!.eq.map((r) => ({ slot: r.slot, key: r.key, cp: pieceCombatPower(Number(r.level), Number(r.transcend)) }));
    const rule = ruleFor(floor, pools);
    const cp = towerCp(eq, rule, keys);
    const base = towerCp(eq, rule, new Set()).total;
    // 탑 전투력 0(요구 장비를 하나도 장착하지 않음) — 한 턴 만에 지고 도전만 날아가니 막는다.
    if (cp.total <= 0) throw new TowerError('NO_POWER');
    const req = towerRequirement(floor);
    const battle = simulateTowerBattle({ towerCp: cp.total, requirement: req, doubledCount: cp.doubledCount, skills: towerFloorSkills(floor), rng });

    // 오르기 = 첫 돌파 보상(목록에서 받기), 토벌 = 이긴 판마다 💎(이 트랜잭션에서 바로 지급).
    const reward: TowerBattleReward | null = !battle.win ? null : hunt ? rollHuntReward(floor, opts.bonusRng ?? rng) : towerReward(floor);
    // 토벌은 이겨도 도전 1회를 쓴다(오르기는 진 판만).
    const spend = hunt || !battle.win;
    const today = kstDateString();
    const pieces = cp.pieces.map((x, i) => (i === 0 ? { ...x, base } : x));
    // ④ 진행도 갱신과 전투 저장을 한 문장으로(데이터 변경 CTE).
    const [row] = (await tx.execute(sql`
      with up as (
        update tower_progress set
          ${!hunt && battle.win ? sql`best_floor=${floor}, best_at=now(),` : sql``}
          ${spend ? sql`losses = case when loss_day = ${today}::date then losses + 1 else 1 end, loss_day = ${today}::date,` : sql``}
          last_profile_id=${profileId}::uuid, updated_at=now()
        where user_id=${userId}::uuid and server_id=${serverId}
      )
      insert into tower_battles (user_id, server_id, floor, win, hunt, tower_cp, requirement, profile_id, pieces, turns, key_turn, reward, idem_key)
      values (${userId}::uuid, ${serverId}, ${floor}, ${battle.win}, ${hunt}, ${cp.total}, ${req}, ${profileId}::uuid,
              ${JSON.stringify(pieces)}::jsonb, ${JSON.stringify(battle.turns)}::jsonb, ${battle.keyIndex}, ${reward ? JSON.stringify(reward) : null}::jsonb, ${idem})
      returning id::text as id`)) as unknown as { id: string }[];
    // 이긴 판만 — 목록 머리 줄의 서버 순위를 액션 응답에 실어 준다(화면을 다시 그리지 않아도 맞게). towerBoard my_rank와 같은 기준.
    let myRank: number | null = null;
    let diamondBalance: string | null = null;
    if (hunt && reward && reward.diamond > 0) {
      await walletAdd(tx, userId, serverId, reward.diamond, 'tower', `tower-hunt:${row!.id}`);
      if (reward.boxes > 0) await addBoxes(tx, userId, serverId, reward.boxes);
      const [c] = (await tx.execute(sql`select diamond::text as d from characters where user_id=${userId}::uuid and server_id=${serverId}`)) as unknown as { d: string }[];
      diamondBalance = c?.d ?? null;
    }
    if (battle.win && !hunt) {
      // 랭킹 표에서 내 값보다 큰 행 수 + 1(towerBoard my_rank와 같은 기준, 10-01) — 전 유저 조인 대신 인덱스 한 번.
      const [rk] = (await tx.execute(sql`
        with me as (select best_floor, best_at from tower_progress where user_id=${userId}::uuid and server_id=${serverId})
        select (count(*) + 1)::int as r from leaderboard_ranks lr, me
        where lr.server_id=${serverId} and lr.metric='tower' and lr.value > ${sql.raw(towerRankValueSql('me'))}`)) as unknown as { r: number }[];
      myRank = rk ? Number(rk.r) : null;
    }
    return {
      battleId: row!.id, floor, win: battle.win, keyIndex: battle.keyIndex, turns: battle.turns, reward,
      attemptsLeft: spend ? left - 1 : left, best: !hunt && battle.win ? floor : best, towerCp: cp.total,
      mult: base > 0 ? Math.round((cp.total / base) * 100) / 100 : 1, myRank, hunt, diamondBalance,
    };
  });
}

/**
 * 토벌 승리 보상 — 서버 RNG로(CLAUDE §3.1) 💎를 범위 안에서 고르게, 10% 더블(굴린 값 ×2), 5% 상자(구간별 고정 수). 셋은 따로 굴린다.
 */
function rollHuntReward(floor: number, rng: Rng10k): TowerBattleReward {
  const { min, max } = towerHuntRange(floor);
  const base = min + Math.floor((rng() * (max - min + 1)) / 10000);
  const double = rng() < TOWER_HUNT_DOUBLE_BP;
  const boxes = rng() < TOWER_HUNT_BOX_BP ? towerHuntBox(floor) : 0;
  return { diamond: double ? base * 2 : base, boxes, double };
}

/** 보급 상자 지급 — 부위마다 3분의 1씩(상자 수는 늘 3의 배수). */
async function addBoxes(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string, serverId: number, boxes: number) {
  const per = Math.floor(boxes / 3);
  for (const slot of TOWER_SLOTS) {
    await tx.execute(sql`
      insert into user_supply_boxes (user_id, server_id, slot, count) values (${userId}::uuid, ${serverId}, ${slot}, ${per})
      on conflict (user_id, server_id, slot) do update set count = user_supply_boxes.count + ${per}`);
  }
}

/**
 * 돌파 보상 받기 — floors = 받을 층(null이면 받을 수 있는 층 전부). 진행도 행을 잠그고 돌파한 층(best_floor 이하)만,
 * tower_claims에 넣은 층만 지급한다(기본 키 충돌 = 이미 받음 → 건너뜀, 이중 수령 없음). 다이아는 한 번에 합쳐 원장 1줄.
 */
export async function claimTowerRewards(userId: string, serverId: number, floors: number[] | null): Promise<{ floors: number[]; diamond: number; boxes: number; diamondBalance: string | null }> {
  return db.transaction(async (tx) => {
    const [p] = (await tx.execute(sql`
      select best_floor from tower_progress where user_id=${userId}::uuid and server_id=${serverId} for update`)) as unknown as { best_floor: number }[];
    const best = Number(p?.best_floor ?? 0);
    const want = floors === null
      ? Array.from({ length: best }, (_, i) => i + 1)
      : [...new Set(floors.map((f) => Math.floor(Number(f))))].filter((f) => f >= 1 && f <= best);
    if (!want.length) return { floors: [], diamond: 0, boxes: 0, diamondBalance: null };
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
    if (boxes > 0) await addBoxes(tx, userId, serverId, boxes);
    // 받은 뒤 잔액 — 화면이 다시 그리지 않고 헤더 다이아를 이 값으로 맞춘다(bigint는 문자열로).
    const [bal] = (await tx.execute(sql`select diamond::text as d from characters where user_id=${userId}::uuid and server_id=${serverId}`)) as unknown as { d: string }[];
    return { floors: done, diamond, boxes, diamondBalance: bal?.d ?? null };
  });
}

export { towerIsSpecial };
