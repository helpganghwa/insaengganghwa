import 'server-only';

/** 개인 월드보스(0253) 화면 조회 — 순위표(10위 + 내 줄)·내 기록·오늘 남은 판·내 장비(탑 규칙)·요구 장비. */
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { TOWER_AVATAR_MULT, pieceCombatPower, pointExtraPrice } from '@/lib/game/balance';
import { spritePath } from '@/lib/game/equipment/sprite-manifest';
import { kstDateString } from '@/lib/kst';
import { parseFaceBox } from '@/components/faceCrop';

import { avatarKeysOf, pickBestLoadoutBy, type BestAvatar } from './best-loadout';
import { SOLO_FREE_RUNS_PER_DAY, type SoloPower, type SoloSlot } from './solo';
import type { SoloDetail } from './solo-types';

const SLOTS: SoloSlot[] = ['weapon', 'armor', 'accessory'];
const iso = (v: Date | string) => new Date(v).toISOString();

export async function getSoloBossDetail(bossId: string, serverId: number, userId: string | null): Promise<SoloDetail | null> {
  if (!/^\d{1,18}$/.test(bossId)) return null;
  const day = kstDateString();
  const [[b], top, ladderRows, mineRows] = await Promise.all([
    db.execute(sql`
      select b.id::text as id, b.server_id, b.zone_id, z.name as zone_name, b.boss_code, b.status, b.leave_at, b.total_damage::text as total, b.stage, b.pool,
             (b.status = 'active' and b.leave_at > now()) as open
        from world_bosses b join zones z on z.id = b.zone_id where b.id = ${bossId}::bigint`) as unknown as Promise<{
      id: string; server_id: number; zone_id: number; zone_name: string; boss_code: string; status: string; leave_at: Date | string; total: string; stage: number;
      pool: Record<SoloSlot, string[]> | null; open: boolean;
    }[]>,
    db.execute(sql`
      select r.user_id::text as uid, c.nickname, r.best::text as best, r.final_rank, c.representative_title_code as title,
             up.rotations->>'south' as avatar, up.options->'faceBox' as fb, g.name as gname, g.emblem_url as gemblem
        from world_boss_solo_records r left join characters c on c.user_id = r.user_id and c.server_id = r.server_id
        left join user_profiles up on up.id = c.active_profile_id
        left join guild_members gm on gm.user_id = r.user_id and gm.server_id = r.server_id
        left join guilds g on g.id = gm.guild_id
       where r.boss_id = ${bossId}::bigint order by r.best desc, r.best_at asc, r.user_id limit 10`) as unknown as Promise<{
      uid: string; nickname: string | null; best: string; final_rank: number | null; title: string | null; avatar: string | null; fb: unknown; gname: string | null; gemblem: string | null;
    }[]>,
    // 기록 경주(공격 화면) — 다른 사람들의 최고 기록 상위 40개(내 기록 제외). 판 도중 '지금 N위권·다음 순위까지'를 화면이 계산한다.
    db.execute(sql`
      select best::text as best from world_boss_solo_records
       where boss_id = ${bossId}::bigint ${userId ? sql`and user_id <> ${userId}::uuid` : sql``}
       order by best desc limit 40`) as unknown as Promise<{ best: string }[]>,
    userId
      ? (db.execute(sql`
          select c.nickname, c.residence_zone_id as home, hz.name as home_name, c.representative_title_code as title,
                 (select up2.options->'faceBox' from user_profiles up2 where up2.id = c.active_profile_id) as fb,
                 (select json_build_object('name', g.name, 'emblem', g.emblem_url) from guild_members gm join guilds g on g.id = gm.guild_id where gm.user_id = c.user_id and gm.server_id = c.server_id) as guild,
                 (select row_to_json(x) from (
                    select r.best::text as best, r.best_at, r.final_rank, r.reward_diamond, r.reward_boxes,
                           (select count(*)::int + 1 from world_boss_solo_records o where o.boss_id = r.boss_id and (o.best > r.best or (o.best = r.best and o.best_at < r.best_at))) as rank
                      from world_boss_solo_records r where r.boss_id = ${bossId}::bigint and r.user_id = ${userId}::uuid) x) as rec,
                 (select count(*) filter (where not paid)::int from world_boss_solo_runs where boss_id = ${bossId}::bigint and user_id = ${userId}::uuid and kst_date = ${day}::date) as free_used,
                 (select count(*) filter (where paid)::int from world_boss_solo_runs where boss_id = ${bossId}::bigint and user_id = ${userId}::uuid and kst_date = ${day}::date) as paid_used,
                 (select coalesce(sum(count), 0)::int from point_extra_buys where user_id = ${userId}::uuid and server_id = ${serverId} and kst_date = ${day}::date and item = 'wb_retry') as bought,
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
            from characters c left join zones hz on hz.id = c.residence_zone_id
           where c.user_id = ${userId}::uuid and c.server_id = ${serverId}`) as unknown as Promise<
          {
            nickname: string | null; home: number | null; home_name: string | null; title: string | null; fb: unknown; guild: { name: string; emblem: string | null } | null;
            rec: { best: string; best_at: string; final_rank: number | null; reward_diamond: number; reward_boxes: number; rank: number } | null;
            free_used: number; paid_used: number; bought: number;
            avatar: { south: string | null; snap: unknown; isDefault: boolean } | null;
            eq: { key: string; name: string; slot: SoloSlot; level: number; transcend: number }[];
            owned: { ueid: string; key: string; name: string; slot: SoloSlot; level: number; transcend: number; on: boolean }[];
            avatars: { id: string; south: string | null; snap: unknown; is_default: boolean; active: boolean }[];
          }[]
        >)
      : Promise.resolve(null),
  ]);
  if (!b || b.server_id !== serverId || b.status === 'scheduled' || !b.pool) return null;
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
      faceBox: parseFaceBox(m.fb),
      title: m.title,
      guildName: m.guild?.name ?? null,
      guildEmblem: m.guild?.emblem ?? null,
      resident: m.home !== null && Number(m.home) === Number(b.zone_id),
      homeZoneName: m.home_name,
      best: m.rec ? Number(m.rec.best) : null,
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
    bossCode: b.boss_code,
    zoneId: Number(b.zone_id),
    zoneName: b.zone_name,
    status,
    leaveAt: iso(b.leave_at),
    total: Number(b.total),
    stage: Number(b.stage),
    ladder: ladderRows.map((r) => Number(r.best)),
    top: top.map((r, i) => ({
      rank: i + 1, userId: r.uid, nickname: r.nickname ?? '알 수 없음', best: Number(r.best), me: r.uid === userId,
      avatar: r.avatar, faceBox: parseFaceBox(r.fb), guildName: r.gname, guildEmblem: r.gemblem, title: r.title,
    })),
    pool: Object.fromEntries(
      SLOTS.map((s) => [s, (pool[s] ?? []).map((k) => ({ key: k, name: nameOf.get(k) ?? k, src: spritePath(k), owned: !!m?.owned.some((o) => o.key === k) }))]),
    ) as SoloDetail['pool'],
    me,
  };
}
