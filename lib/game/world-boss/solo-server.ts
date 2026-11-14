import 'server-only';

/**
 * 개인 월드보스(0253) 서버 판정 — 도전 1판(10타)을 한 트랜잭션에서 굴리고 저장한다. 화면은 저장된 10타를 받아 공격 버튼으로 하나씩 보여 준다.
 *
 * - 참가: 출현 구역 거주자(이사 와도 된다). 하루(KST) 무료 1판 + 산 재도전(wb_retry)만큼.
 * - 힘: 탑 규칙 — 장착 3개 중 보스 요구 장비 ×1, 그중 지금 아바타 생성에도 쓰인 장비 ×2, 그 밖 ×0. 아바타는 지금 고른 아바타(active_profile_id).
 * - 기록: (보스, 유저) 최고 점수만 남긴다(더 높을 때만 갱신, 동점은 먼저 세운 사람). 모든 판의 점수는 보스 누적 피해(공동 페이즈)에 쌓인다.
 * - 잠금: 유저별 권고 잠금(wb_solo:유저) — 같은 사람의 도전·재도전 구매를 직렬화. 보스 행은 마지막 누적 갱신 한 번만 잡는다(핫 행 대기 최소).
 */
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { pieceCombatPower } from '@/lib/game/balance';
import { extrasToday, PointShopError } from '@/lib/game/points/spend';
import { towerCp, type EquippedPiece, type TowerSlot } from '@/lib/game/tower/engine';
import { kstDateString } from '@/lib/kst';

import { WorldBossError } from './errors';
import { rollSoloRun, soloPhaseFor, soloRunScore, SOLO_FREE_RUNS_PER_DAY, type SoloHit, type SoloPower } from './solo';
import { cryptoRand } from './weak-server';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Pool = { weapon: string[]; armor: string[]; accessory: string[] };

export type SoloRunResult = {
  runId: string;
  hits: SoloHit[];
  score: number;
  power: SoloPower;
  /** 이 판 전 내 최고 기록·순위(첫 판이면 null). */
  prevBest: number | null;
  prevRank: number | null;
  best: number;
  rank: number;
  /** 이 판 전·후 보스 누적 피해(페이즈 막대 연출). */
  totalBefore: number;
  totalAfter: number;
  /** 이 보스에 내가 넣은 누적 피해(이 판 포함) — 기여도 = dealt ÷ totalAfter(11-14 기여도 보상). */
  dealt: number;
  /** 오늘 남은 도전(무료 + 산 재도전 중 안 쓴 것). */
  runsLeft: number;
  paid: boolean;
  replayed?: boolean;
};

async function lockUser(tx: Tx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`wb_solo:${userId}`}, 0))`);
}

type BossRow = { id: string; zone_id: number; status: string; open: boolean; pool: Pool | null };

/** 이 유저가 지금 도전할 수 있는 개인 보스 — 거주 구역에 출현 중인 것. 없으면 null. */
async function soloBossOfResident(tx: Tx, userId: string, serverId: number): Promise<BossRow | null> {
  const [b] = (await tx.execute(sql`
    select b.id::text as id, b.zone_id, b.status, (b.status = 'active' and b.leave_at > now()) as open, b.pool
      from characters c join world_bosses b on b.zone_id = c.residence_zone_id and b.server_id = c.server_id
     where c.user_id = ${userId}::uuid and c.server_id = ${serverId} and b.pool is not null and b.status = 'active' and b.leave_at > now()
     order by b.spawn_at desc limit 1`)) as unknown as BossRow[];
  return b ?? null;
}

/** 오늘 쓴 판(무료·유료)과 산 재도전 수. */
async function todayRuns(tx: Tx, userId: string, serverId: number, bossId: string, day: string) {
  // 산 재도전은 보스별(11-14 결정) — point_extra_buys.slot = 그 보스의 구역 id(구역마다 개인 보스는 한 번에 하나).
  // 같은 구역에 같은 날 여왕이 연달아 나오면 산 횟수(구역·날짜)가 이어지므로, 쓴 유료 판도 그 구역의 오늘 보스 전부로 센다
  // (앞 여왕에서 산 재도전을 다음 여왕에서 공짜로 쓰지 않게, 11-14 검수). 무료 판은 보스마다.
  const [r] = (await tx.execute(sql`
    select count(*) filter (where not u.paid and u.boss_id = ${bossId}::bigint)::int as free, count(*) filter (where u.paid)::int as paid, b.zone_id
      from world_bosses b
      left join world_bosses z on z.server_id = b.server_id and z.zone_id = b.zone_id
      left join world_boss_solo_runs u on u.boss_id = z.id and u.user_id = ${userId}::uuid and u.server_id = ${serverId} and u.kst_date = ${day}::date
     where b.id = ${bossId}::bigint
     group by b.zone_id`)) as unknown as { free: number; paid: number; zone_id: number }[];
  const bought = r ? await extrasToday(tx, userId, serverId, 'wb_retry', Number(r.zone_id), day) : 0;
  return { free: Number(r?.free ?? 0), paid: Number(r?.paid ?? 0), bought };
}
function runsLeftOf(t: { free: number; paid: number; bought: number }) {
  return Math.max(0, SOLO_FREE_RUNS_PER_DAY - t.free) + Math.max(0, t.bought - t.paid);
}

/**
 * 재도전 구매(buyExtra 'wb_retry')의 콘텐츠 잠금 — 거주 구역에 개인 보스가 있고, 오늘 무료 판을 썼고, 사 둔 재도전을 다 썼을 때만 산다
 * (쓰지 않은 재도전이 남았는데 또 사면 자정에 사라질 포인트만 나간다).
 */
export async function wbRetryLock(tx: Tx, userId: string, serverId: number): Promise<number> {
  await lockUser(tx, userId);
  const boss = await soloBossOfResident(tx, userId, serverId);
  if (!boss) throw new PointShopError('NOT_NEEDED');
  const t = await todayRuns(tx, userId, serverId, boss.id, kstDateString());
  if (runsLeftOf(t) > 0) throw new PointShopError('NOT_NEEDED');
  return Number(boss.zone_id);
}

/** 재도전 구매 행의 slot — 거주 구역에 개인 보스가 있으면 그 구역 id, 없으면 null(재전송 응답의 횟수 계산용). */
export async function wbRetrySlot(tx: Tx, userId: string, serverId: number): Promise<number | null> {
  const boss = await soloBossOfResident(tx, userId, serverId);
  return boss ? Number(boss.zone_id) : null;
}

/** 이 보스에 내가 넣은 누적 피해(모든 판). */
async function dealtOf(tx: Tx, userId: string, bossId: string): Promise<number> {
  const [r] = (await tx.execute(sql`select coalesce(sum(score), 0)::text as s from world_boss_solo_runs where boss_id = ${bossId}::bigint and user_id = ${userId}::uuid`)) as unknown as { s: string }[];
  return Number(r?.s ?? 0);
}

/** 내 순위 = 나보다 높은 기록 수 + 1(동점은 먼저 세운 사람이 위). */
async function rankOf(tx: Tx, serverId: number, bossId: string, best: number, bestAt: string): Promise<number> {
  const [r] = (await tx.execute(sql`
    select count(*)::int + 1 as rank from world_boss_solo_records o
     where o.boss_id = ${bossId}::bigint and o.server_id = ${serverId} and (o.best > ${best}::bigint or (o.best = ${best}::bigint and o.best_at < ${bestAt}::timestamptz))
       and not exists (select 1 from profiles p where p.id = o.user_id and p.withdrawn_at is not null)`)) as unknown as { rank: number }[];
  return Number(r?.rank ?? 1);
}

/** 도전 1판. idemKey = 화면이 판마다 만든 uuid(재전송이면 저장된 판을 돌려준다). */
export async function runSolo(userId: string, serverId: number, bossId: string, idemKey: string, rand: () => number = cryptoRand): Promise<SoloRunResult> {
  if (!/^\d{1,18}$/.test(bossId)) throw new WorldBossError('BOSS_NOT_FOUND');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idemKey)) throw new WorldBossError('BAD_REQUEST');
  const day = kstDateString();
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local lock_timeout = '3s'`);
    await lockUser(tx, userId);

    // ① 재전송 — 같은 키의 판이 있으면 그대로 돌려준다(순위·누적은 지금 값).
    const [prev] = (await tx.execute(sql`
      select r.id::text as id, r.hits, r.score::text as score, r.power, r.paid, rec.best::text as best, rec.best_at::text as best_at, b.total_damage::text as total
        from world_boss_solo_runs r join world_boss_solo_records rec on rec.boss_id = r.boss_id and rec.user_id = r.user_id
        join world_bosses b on b.id = r.boss_id
       where r.idem_key = ${idemKey}::uuid and r.user_id = ${userId}::uuid and r.boss_id = ${bossId}::bigint`)) as unknown as {
      id: string; hits: SoloHit[]; score: string; power: SoloPower; paid: boolean; best: string; best_at: string; total: string;
    }[];
    if (prev) {
      const rank = await rankOf(tx, serverId, bossId, Number(prev.best), prev.best_at);
      const t = await todayRuns(tx, userId, serverId, bossId, day);
      const dealt = await dealtOf(tx, userId, bossId);
      return {
        dealt,
        runId: prev.id, hits: prev.hits, score: Number(prev.score), power: prev.power, prevBest: null, prevRank: null,
        // 재전송은 판 전 누적을 모른다 — 지금 누적에서 이 판을 뺀 값으로(페이즈 게이지가 이 판을 두 번 더하지 않게, 11-14 검수).
        best: Number(prev.best), rank, totalBefore: Math.max(0, Number(prev.total) - Number(prev.score)), totalAfter: Number(prev.total), runsLeft: runsLeftOf(t), paid: prev.paid, replayed: true,
      };
    }

    // ② 보스·거주·남은 판. 보스 행을 KEY SHARE로 잡는다 — 정산(FOR UPDATE)과 줄을 세워, 종료 직전 판이 정산 뒤에 끼어들거나
    //    (기록은 있는데 최종 순위·우편이 없음) 기록 행·보스 행을 반대 순서로 잡아 교착되지 않게. 다른 사람의 판끼리는 막지 않는다.
    const [boss] = (await tx.execute(sql`
      select b.id::text as id, b.zone_id, b.status, (b.status = 'active' and b.leave_at > now()) as open, b.pool,
             (select c.residence_zone_id from characters c where c.user_id = ${userId}::uuid and c.server_id = ${serverId}) as home,
             (select c.active_profile_id::text from characters c where c.user_id = ${userId}::uuid and c.server_id = ${serverId}) as profile
        from world_bosses b where b.id = ${bossId}::bigint and b.server_id = ${serverId} for key share of b`)) as unknown as (BossRow & { home: number | null; profile: string | null })[];
    // 예정 보스는 없는 보스와 같은 답으로 — 응답으로 출현 예정이 드러나지 않게(운영 소환 비노출, 11-14 검수).
    if (!boss || boss.status === 'scheduled') throw new WorldBossError('BOSS_NOT_FOUND');
    if (!boss.pool) throw new WorldBossError('NOT_SOLO');
    if (!boss.open) throw new WorldBossError('BOSS_NOT_ACTIVE');
    if (boss.home === null || boss.home === undefined) throw new WorldBossError('NO_CHARACTER');
    if (Number(boss.home) !== Number(boss.zone_id)) throw new WorldBossError('NOT_RESIDENT');
    const t = await todayRuns(tx, userId, serverId, bossId, day);
    if (runsLeftOf(t) <= 0) throw new WorldBossError('NO_RUNS');
    const paid = t.free >= SOLO_FREE_RUNS_PER_DAY;

    // ③ 힘 — 장착(활성 카탈로그) + 지금 아바타 장비.
    const [g] = (await tx.execute(sql`
      select
        (select json_build_object('snap', up.equipment_snapshot, 'isDefault', coalesce((up.options->>'isDefault')::boolean, false))
           from user_profiles up where up.id = ${boss.profile}::uuid and up.user_id = ${userId}::uuid) as avatar,
        coalesce((select json_agg(e) from (
          select ci.code as key, ci.slot::text as slot, ue.enhance_level as level, ue.transcend_level as transcend
            from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
           where ue.user_id = ${userId}::uuid and ue.server_id = ${serverId} and ue.equipped_slot is not null and ci.active) e), '[]'::json) as eq`)) as unknown as {
      avatar: { snap: unknown; isDefault: boolean } | null;
      eq: { key: string; slot: TowerSlot; level: number; transcend: number }[];
    }[];
    const power = soloPowerOf(g!.eq, boss.pool, g!.avatar);
    if (power.weapon + power.armor + power.accessory <= 0) throw new WorldBossError('NO_POWER');

    // ④ 굴리고 저장.
    const hits = rollSoloRun(power, rand);
    const score = soloRunScore(hits);
    const [old] = (await tx.execute(sql`
      select best::text as best, best_at::text as best_at from world_boss_solo_records where boss_id = ${bossId}::bigint and user_id = ${userId}::uuid and server_id = ${serverId}`)) as unknown as { best: string; best_at: string }[];
    const prevBest = old ? Number(old.best) : null;
    const prevRank = old ? await rankOf(tx, serverId, bossId, Number(old.best), old.best_at) : null;
    const [run] = (await tx.execute(sql`
      insert into world_boss_solo_runs (boss_id, user_id, server_id, kst_date, paid, score, hits, power, idem_key)
      values (${bossId}::bigint, ${userId}::uuid, ${serverId}, ${day}::date, ${paid}, ${score}, ${JSON.stringify(hits)}::jsonb, ${JSON.stringify(power)}::jsonb, ${idemKey}::uuid)
      returning id::text as id, created_at::text as at`)) as unknown as { id: string; at: string }[];
    const [rec] = (await tx.execute(sql`
      insert into world_boss_solo_records (boss_id, user_id, server_id, best, best_at, best_run_id, runs)
      values (${bossId}::bigint, ${userId}::uuid, ${serverId}, ${score}, ${run!.at}::timestamptz, ${run!.id}::bigint, 1)
      on conflict (boss_id, user_id) do update set
        runs = world_boss_solo_records.runs + 1,
        best = greatest(world_boss_solo_records.best, excluded.best),
        best_at = case when excluded.best > world_boss_solo_records.best then excluded.best_at else world_boss_solo_records.best_at end,
        best_run_id = case when excluded.best > world_boss_solo_records.best then excluded.best_run_id else world_boss_solo_records.best_run_id end
      returning best::text as best, best_at::text as best_at`)) as unknown as { best: string; best_at: string }[];
    const rank = await rankOf(tx, serverId, bossId, Number(rec!.best), rec!.best_at);

    // ⑤ 공동 누적 + 페이즈 — 아직 머무는 보스에만(정산이 끝났으면 BOSS_NOT_ACTIVE로 이 판 전체를 되돌린다).
    const [tot] = (await tx.execute(sql`
      update world_bosses set total_damage = total_damage + ${score}::bigint
       where id = ${bossId}::bigint and server_id = ${serverId} and status = 'active'
      returning total_damage::text as total`)) as unknown as { total: string }[];
    if (!tot) throw new WorldBossError('BOSS_NOT_ACTIVE');
    const totalAfter = Number(tot.total);
    const stage = soloPhaseFor(totalAfter).stage;
    await tx.execute(sql`update world_bosses set stage = greatest(stage, ${stage}) where id = ${bossId}::bigint and server_id = ${serverId}`);

    const dealt = await dealtOf(tx, userId, bossId);
    return {
      dealt,
      runId: run!.id, hits, score, power, prevBest, prevRank, best: Number(rec!.best), rank,
      totalBefore: totalAfter - score, totalAfter, runsLeft: runsLeftOf({ ...t, free: t.free + (paid ? 0 : 1), paid: t.paid + (paid ? 1 : 0) }), paid,
    };
  });
}

/** 탑 규칙 부위별 전투력 — 화면(도전 전 미리 보기)과 판정이 같은 함수를 쓴다. */
export function soloPowerOf(
  eq: { key: string; slot: TowerSlot; level: number; transcend: number }[],
  pool: Pool,
  avatar: { snap: unknown; isDefault: boolean } | null,
): SoloPower {
  let keys = new Set<string>();
  if (avatar && !avatar.isDefault && avatar.snap && typeof avatar.snap === 'object') {
    const s = avatar.snap as Record<string, unknown>;
    keys = new Set(['weaponKey', 'armorKey', 'accessoryKey'].map((k) => s[k]).filter((v): v is string => typeof v === 'string'));
  }
  const pieces: EquippedPiece[] = eq.map((r) => ({ slot: r.slot, key: r.key, cp: pieceCombatPower(Number(r.level), Number(r.transcend)) }));
  const allowed = new Set([...pool.weapon, ...pool.armor, ...pool.accessory]);
  const cp = towerCp(pieces, { floor: 0, allowed }, keys);
  const out: SoloPower = { weapon: 0, armor: 0, accessory: 0 };
  for (const p of cp.pieces) out[p.slot] += p.score;
  return out;
}
