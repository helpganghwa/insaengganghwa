import 'server-only';

/** 개인 월드보스(0253) 화면 조회 — 순위표(10위 + 내 줄)·내 기록·오늘 남은 판·내 장비(탑 규칙)·요구 장비. */
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { TOWER_AVATAR_MULT, pieceCombatPower, pointExtraPrice } from '@/lib/game/balance';
import { spritePath } from '@/lib/game/equipment/sprite-manifest';
import { kstDateString } from '@/lib/kst';
import { parseFaceBox } from '@/components/faceCrop';

import { avatarKeysOf, pickBestLoadoutBy, type BestAvatar } from './best-loadout';
import { SOLO_FREE_RUNS_PER_DAY, SOLO_TOP_SHOWN, type SoloHit, type SoloPower, type SoloSlot } from './solo';
import type { SoloDetail } from './solo-types';

const SLOTS: SoloSlot[] = ['weapon', 'armor', 'accessory'];
const iso = (v: Date | string) => new Date(v).toISOString();

export async function getSoloBossDetail(bossId: string, serverId: number, userId: string | null): Promise<SoloDetail | null> {
  if (!/^\d{1,18}$/.test(bossId)) return null;
  const day = kstDateString();
  // 보스 행부터 — 원정대 보스 상세(이 함수를 먼저 거친다)에서 쓰지 않을 순위·내 정보 쿼리가 돌지 않게(11-14 검수).
  const [b] = (await db.execute(sql`
      select b.id::text as id, b.server_id, b.zone_id, z.name as zone_name, b.boss_code, b.status, b.leave_at, b.total_damage::text as total, b.stage, b.pool,
             (b.status = 'active' and b.leave_at > now()) as open
        from world_bosses b join zones z on z.id = b.zone_id where b.id = ${bossId}::bigint`)) as unknown as {
      id: string; server_id: number; zone_id: number; zone_name: string; boss_code: string; status: string; leave_at: Date | string; total: string; stage: number;
      pool: Record<SoloSlot, string[]> | null; open: boolean;
    }[];
  if (!b || b.server_id !== serverId || b.status === 'scheduled' || !b.pool) return null;
  const [top, ladderRows, mineRows] = await Promise.all([
    db.execute(sql`
      select r.user_id::text as uid, c.nickname, (select p.public_code from profiles p where p.id = r.user_id) as code, r.best::text as best, r.final_rank, r.reward_diamond, r.reward_boxes, c.representative_title_code as title,
             (select coalesce(sum(u.score), 0)::text from world_boss_solo_runs u where u.boss_id = r.boss_id and u.user_id = r.user_id and u.created_at >= c.created_at) as dealt,
             up.rotations->>'south' as avatar, up.options->'faceBox' as fb, g.name as gname, g.emblem_url as gemblem
        from world_boss_solo_records r left join characters c on c.user_id = r.user_id and c.server_id = r.server_id
        left join user_profiles up on up.id = c.active_profile_id
        left join guild_members gm on gm.user_id = r.user_id and gm.server_id = r.server_id
        left join guilds g on g.id = gm.guild_id
       where r.boss_id = ${bossId}::bigint and exists (select 1 from characters cc where cc.user_id = r.user_id and cc.server_id = r.server_id and cc.created_at <= r.best_at)
       order by r.best desc, r.best_at asc, r.user_id limit ${SOLO_TOP_SHOWN}`) as unknown as Promise<{
      uid: string; nickname: string | null; code: string | null; best: string; dealt: string; final_rank: number | null; reward_diamond: number; reward_boxes: number; title: string | null; avatar: string | null; fb: unknown; gname: string | null; gemblem: string | null;
    }[]>,
    // 기록 경주(공격 화면) — 다른 사람들의 최고 기록 상위 40개(내 기록 제외). 판 도중 '지금 N위권·다음 순위까지'를 화면이 계산한다.
    db.execute(sql`
      select r.best::text as best from world_boss_solo_records r
       where r.boss_id = ${bossId}::bigint and exists (select 1 from characters cc where cc.user_id = r.user_id and cc.server_id = r.server_id and cc.created_at <= r.best_at) ${userId ? sql`and r.user_id <> ${userId}::uuid` : sql``}
       order by r.best desc limit 40`) as unknown as Promise<{ best: string }[]>,
    userId
      ? (db.execute(sql`
          select c.nickname, (select p.public_code from profiles p where p.id = c.user_id) as code, c.representative_title_code as title,
                 (select up2.options->'faceBox' from user_profiles up2 where up2.id = c.active_profile_id) as fb,
                 (select json_build_object('name', g.name, 'emblem', g.emblem_url) from guild_members gm join guilds g on g.id = gm.guild_id where gm.user_id = c.user_id and gm.server_id = c.server_id) as guild,
                 (select row_to_json(x) from (
                    select r.best::text as best, r.best_at, r.final_rank, r.reward_diamond, r.reward_boxes,
                           (select count(*)::int + 1 from world_boss_solo_records o where o.boss_id = r.boss_id and (o.best > r.best or (o.best = r.best and o.best_at < r.best_at)) and exists (select 1 from characters cc where cc.user_id = o.user_id and cc.server_id = o.server_id and cc.created_at <= o.best_at)) as rank
                      from world_boss_solo_records r where r.boss_id = ${bossId}::bigint and r.user_id = ${userId}::uuid and r.best_at >= c.created_at) x) as rec,
                 (select coalesce(sum(u.score), 0)::text from world_boss_solo_runs u where u.boss_id = ${bossId}::bigint and u.user_id = ${userId}::uuid and u.created_at >= c.created_at) as dealt,
                 -- 내 도전 기록(11-16 스타·지인 건의) — 최근 30판, 10타 그대로(다시 보기).
                 coalesce((select json_agg(x order by x.at desc) from (
                    select u.id::text as id, u.created_at as at, u.paid, u.score::text as score, u.hits
                      from world_boss_solo_runs u where u.boss_id = ${bossId}::bigint and u.user_id = ${userId}::uuid and u.created_at >= c.created_at
                     order by u.created_at desc limit 30) x), '[]'::json) as runs,
                 -- 30판을 넘으면 목록은 최근 30판만이라 전체 판 수는 따로 센다(팝업 문구가 '최근 30회'로 바뀐다).
                 (select count(*)::int from world_boss_solo_runs u where u.boss_id = ${bossId}::bigint and u.user_id = ${userId}::uuid and u.created_at >= c.created_at) as runs_total,
                 (select count(*) filter (where not u.paid)::int from world_boss_solo_runs u where u.boss_id = ${bossId}::bigint and u.user_id = ${userId}::uuid and u.kst_date = ${day}::date and u.created_at >= c.created_at) as free_used,
                 (select count(*) filter (where u.paid)::int from world_boss_solo_runs u join world_bosses z on z.id = u.boss_id
                   where z.server_id = ${serverId} and z.zone_id = ${b.zone_id} and u.user_id = ${userId}::uuid and u.kst_date = ${day}::date and u.created_at >= c.created_at) as paid_used,
                 (select coalesce(sum(count), 0)::int from point_extra_buys where user_id = ${userId}::uuid and server_id = ${serverId} and kst_date = ${day}::date and item = 'wb_retry' and slot = ${b.zone_id}) as bought,
                 (select json_build_object('south', up.rotations->>'south', 'snap', up.equipment_snapshot, 'isDefault', coalesce((up.options->>'isDefault')::boolean, false))
                    from user_profiles up where up.id = c.active_profile_id) as avatar,
                 coalesce((select json_agg(e) from (
                    select ci.code as key, ci.name, ci.slot::text as slot, ue.enhance_level as level, ue.transcend_level as transcend
                      from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
                     where ue.user_id = c.user_id and ue.server_id = c.server_id and ue.equipped_slot is not null and ci.active) e), '[]'::json) as eq,
                 coalesce((select json_agg(o) from (
                    select ue.id::text as ueid, ci.code as key, ci.name, ci.slot::text as slot, ue.enhance_level as level, ue.transcend_level as transcend, (ue.equipped_slot is not null) as on
                      from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
                     where ue.user_id = c.user_id and ue.server_id = c.server_id and ci.active) o), '[]'::json) as owned,
                 coalesce((select json_agg(a) from (
                    select up.id::text as id, up.rotations->>'south' as south, up.equipment_snapshot as snap, coalesce((up.options->>'isDefault')::boolean, false) as is_default, (up.id = c.active_profile_id) as active
                      from user_profiles up where up.user_id = c.user_id and up.server_id = c.server_id) a), '[]'::json) as avatars
            from characters c
           where c.user_id = ${userId}::uuid and c.server_id = ${serverId}`) as unknown as Promise<
          {
            nickname: string | null; code: string | null; title: string | null; fb: unknown; guild: { name: string; emblem: string | null } | null;
            rec: { best: string; best_at: string; final_rank: number | null; reward_diamond: number; reward_boxes: number; rank: number } | null;
            dealt: string | null; runs: { id: string; at: string; paid: boolean; score: string; hits: SoloHit[] }[]; runs_total: number; free_used: number; paid_used: number; bought: number;
            avatar: { south: string | null; snap: unknown; isDefault: boolean } | null;
            eq: { key: string; name: string; slot: SoloSlot; level: number; transcend: number }[];
            owned: { ueid: string; key: string; name: string; slot: SoloSlot; level: number; transcend: number; on: boolean }[];
            avatars: { id: string; south: string | null; snap: unknown; is_default: boolean; active: boolean }[];
          }[]
        >)
      : Promise.resolve(null),
  ]);
  const pool = b.pool;
  const allowed = new Set(SLOTS.flatMap((s) => pool[s] ?? []));
  const status: SoloDetail['status'] = b.open ? 'active' : b.status === 'left' ? 'left' : 'settling';

  // 요구 장비 이름 — 풀 30개.
  const names = (await db.execute(sql`select code, name from catalog_items where code = any(${`{${[...allowed].map((c) => `"${c.replace(/"/g, '')}"`).join(',')}}`}::text[])`)) as unknown as { code: string; name: string }[];
  const nameOf = new Map(names.map((r) => [r.code, r.name] as const));

  const m = mineRows?.[0] ?? null;
  let me: SoloDetail['me'] = null;
  if (m) {
    const keys = m.avatar && !m.avatar.isDefault ? avatarKeysOf(m.avatar.snap) : null;
    const pieces = SLOTS.flatMap((slot) => {
      const e = m.eq.find((x) => x.slot === slot);
      if (!e) return [];
      const cp = pieceCombatPower(Number(e.level), Number(e.transcend));
      const ok = allowed.has(e.key);
      const mult: 0 | 1 | 2 = !ok ? 0 : keys && keys[slot] === e.key ? (TOWER_AVATAR_MULT as 2) : 1;
      return [{ slot, key: e.key, name: e.name, level: Number(e.level), transcend: Number(e.transcend), cp, mult, score: cp * mult, src: spritePath(e.key) }];
    });
    const power: SoloPower = { weapon: 0, armor: 0, accessory: 0 };
    for (const p of pieces) power[p.slot] += p.score;
    const freeLeft = Math.max(0, SOLO_FREE_RUNS_PER_DAY - Number(m.free_used));
    const retryLeft = Math.max(0, Number(m.bought) - Number(m.paid_used));
    const owned = new Set(m.owned.map((o) => o.key));
    // 가진 요구 장비(부위 고르기 목록) — 탑 규칙 배수를 지금 아바타 기준으로 붙인다.
    const ownedRequired = m.owned
      .filter((o) => allowed.has(o.key))
      .map((o) => {
        const cp = pieceCombatPower(Number(o.level), Number(o.transcend));
        const mult: 1 | 2 = keys && keys[o.slot] === o.key ? (TOWER_AVATAR_MULT as 2) : 1;
        return { ueid: o.ueid, key: o.key, name: o.name, slot: o.slot, level: Number(o.level), transcend: Number(o.transcend), cp, mult, score: cp * mult, equipped: !!o.on, src: spritePath(o.key) };
      })
      .sort((a, b) => Number(b.equipped) - Number(a.equipped) || b.score - a.score);
    // 추천 장착(장비 + 아바타)으로 오르는 전투력 미리 보기 — soloEquipBestAction과 같은 규칙(bestLoadoutOf solo).
    const customs = m.avatars.flatMap((a) => {
      const k = !a.is_default ? avatarKeysOf(a.snap) : null;
      return k ? [{ id: a.id, keys: k, active: !!a.active }] : [];
    });
    const cands: BestAvatar[] = customs.some((a) => a.active) ? customs : [{ id: null, keys: null, active: true }, ...customs];
    const plan = pickBestLoadoutBy(
      m.owned.map((o) => ({ ueid: o.ueid, slot: o.slot, code: o.key, cp: Math.round(pieceCombatPower(Number(o.level), Number(o.transcend))), on: !!o.on })),
      cands,
      (pc, avMatch) => (allowed.has(pc.code) ? pc.cp * (avMatch ? TOWER_AVATAR_MULT : 1) : 0),
    );
    me = {
      nickname: m.nickname ?? '',
      publicCode: m.code ?? null,
      faceBox: parseFaceBox(m.fb),
      title: m.title,
      guildName: m.guild?.name ?? null,
      guildEmblem: m.guild?.emblem ?? null,
      best: m.rec ? Number(m.rec.best) : null,
      dealt: Number(m.dealt ?? 0),
      runs: (m.runs ?? []).map((r) => ({ id: r.id, at: new Date(r.at).toISOString(), paid: r.paid, score: Number(r.score), hits: r.hits })),
      runsTotal: Number(m.runs_total ?? 0),
      rank: m.rec ? Number(m.rec.rank) : null,
      finalRank: m.rec?.final_rank ?? null,
      reward: m.rec && m.rec.final_rank ? { diamond: Number(m.rec.reward_diamond), boxes: Number(m.rec.reward_boxes) } : null,
      freeLeft,
      retryLeft,
      retryBought: Number(m.bought),
      retryNext: pointExtraPrice('wb_retry', Number(m.bought)),
      pieces,
      power,
      avatarSouth: m.avatar?.south ?? null,
      hasAvatar: !!keys,
      ownedRequired: [...allowed].filter((k) => owned.has(k)).length,
      requiredItems: ownedRequired,
      avatars: m.avatars.map((a) => ({ id: a.id, south: a.south, isDefault: !!a.is_default, active: !!a.active, keys: !a.is_default ? avatarKeysOf(a.snap) : null })),
      bestPower: plan.changed && Math.round(plan.power) > Math.round(power.weapon + power.armor + power.accessory) ? Math.round(plan.power) : null,
    };
  }
  return {
    id: b.id,
    serverId: Number(b.server_id),
    bossCode: b.boss_code,
    zoneId: Number(b.zone_id),
    zoneName: b.zone_name,
    status,
    leaveAt: iso(b.leave_at),
    total: Number(b.total),
    stage: Number(b.stage),
    ladder: ladderRows.map((r) => Number(r.best)),
    top: top.map((r, i) => ({
      rank: r.final_rank != null ? Number(r.final_rank) : i + 1,
      reward: r.final_rank != null ? { diamond: Number(r.reward_diamond), boxes: Number(r.reward_boxes) } : null,
      userId: r.uid, nickname: r.nickname ?? '알 수 없음', publicCode: r.code, best: Number(r.best), dealt: Number(r.dealt), me: r.uid === userId,
      avatar: r.avatar, faceBox: parseFaceBox(r.fb), guildName: r.gname, guildEmblem: r.gemblem, title: r.title,
    })),
    pool: Object.fromEntries(
      SLOTS.map((s) => [s, (pool[s] ?? []).map((k) => ({ key: k, name: nameOf.get(k) ?? k, src: spritePath(k), owned: !!m?.owned.some((o) => o.key === k) }))]),
    ) as SoloDetail['pool'],
    me,
  };
}

/**
 * 다시 보기(11-16) — 지난 한 판을 그때 모습 그대로 전투 화면에 넣을 값. 10타는 저장된 그대로, 순위·최고 기록·누적 피해·
 * 기록 경주(다른 사람 최고 기록)는 그 판 시각 기준으로 도전 기록에서 다시 센다(지금 값이 아니라).
 * 같은 최고 기록이면 먼저 낸 쪽이 앞(순위표와 같은 규칙). 탈퇴한 유저와 재가입 전 캐릭터의 판은 뺀다(지금 캐릭터 생성 이후만). 내 판이 아니면 null.
 */
export async function getSoloReplay(userId: string, serverId: number, bossId: string, runId: string) {
  const [run] = (await db.execute(sql`
    select u.id::text as id, u.hits, u.power, u.score::text as score, u.paid, u.created_at::text as at
      from world_boss_solo_runs u join world_bosses b on b.id = u.boss_id
     where u.id = ${runId}::bigint and u.boss_id = ${bossId}::bigint and u.user_id = ${userId}::uuid and b.server_id = ${serverId}
       and u.created_at >= (select c.created_at from characters c where c.user_id = u.user_id and c.server_id = u.server_id)`)) as unknown as {
    id: string; hits: SoloHit[]; power: SoloPower; score: string; paid: boolean; at: string;
  }[];
  if (!run) return null;
  const [ctx] = (await db.execute(sql`
    with asof as (
      select u.user_id, max(u.score) as best from world_boss_solo_runs u
       where u.boss_id = ${bossId}::bigint and u.created_at <= ${run.at}::timestamptz
         and u.created_at >= (select c.created_at from characters c where c.user_id = u.user_id and c.server_id = u.server_id)
       group by u.user_id),
    others as (
      select a.best, (select min(x.created_at) from world_boss_solo_runs x where x.boss_id = ${bossId}::bigint and x.user_id = a.user_id and x.score = a.best and x.created_at <= ${run.at}::timestamptz
                and x.created_at >= (select c.created_at from characters c where c.user_id = x.user_id and c.server_id = x.server_id)) as best_at
        from asof a where a.user_id <> ${userId}::uuid),
    mine as (
      select max(score) filter (where created_at < ${run.at}::timestamptz) as prev_best,
             max(score) filter (where created_at <= ${run.at}::timestamptz) as best,
             coalesce(sum(score) filter (where created_at <= ${run.at}::timestamptz), 0) as dealt
        from world_boss_solo_runs where boss_id = ${bossId}::bigint and user_id = ${userId}::uuid
         and created_at >= (select c.created_at from characters c where c.user_id = ${userId}::uuid and c.server_id = ${serverId})),
    mine_at as (
      select (select min(created_at) from world_boss_solo_runs where boss_id = ${bossId}::bigint and user_id = ${userId}::uuid and score = m.best and created_at <= ${run.at}::timestamptz
                and created_at >= (select c.created_at from characters c where c.user_id = ${userId}::uuid and c.server_id = ${serverId})) as best_at,
             (select min(created_at) from world_boss_solo_runs where boss_id = ${bossId}::bigint and user_id = ${userId}::uuid and score = m.prev_best and created_at < ${run.at}::timestamptz
                and created_at >= (select c.created_at from characters c where c.user_id = ${userId}::uuid and c.server_id = ${serverId})) as prev_at
        from mine m)
    select m.prev_best::text as prev_best, m.best::text as best, m.dealt::text as dealt,
           (select coalesce(sum(score), 0) from world_boss_solo_runs where boss_id = ${bossId}::bigint and created_at < ${run.at}::timestamptz)::text as total_before,
           (select count(*)::int + 1 from others o where o.best > m.best or (o.best = m.best and o.best_at < ma.best_at)) as rank,
           case when m.prev_best is null then null else
             (select count(*)::int + 1 from others o where o.best_at < ${run.at}::timestamptz and (o.best > m.prev_best or (o.best = m.prev_best and o.best_at < ma.prev_at))) end as prev_rank,
           coalesce((select json_agg(x.best::text order by x.best desc) from (select best from others order by best desc limit 40) x), '[]'::json) as ladder
      from mine m, mine_at ma`)) as unknown as {
    prev_best: string | null; best: string; dealt: string; total_before: string; rank: number; prev_rank: number | null; ladder: string[];
  }[];
  const score = Number(run.score);
  const totalBefore = Number(ctx!.total_before);
  return {
    run: {
      runId: run.id, hits: run.hits, score, power: run.power,
      prevBest: ctx!.prev_best != null ? Number(ctx!.prev_best) : null,
      prevRank: ctx!.prev_rank != null ? Number(ctx!.prev_rank) : null,
      best: Number(ctx!.best), rank: Number(ctx!.rank),
      totalBefore, totalAfter: totalBefore + score, dealt: Number(ctx!.dealt),
      runsLeft: 0, paid: run.paid,
    },
    ladder: ctx!.ladder.map(Number),
  };
}
