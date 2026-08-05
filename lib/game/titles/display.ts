import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

import { TITLE_BY_CODE } from './defs';
import { TITLE_SECRET_BY_CODE } from './defs.server';

/**
 * 표시용 대표 칭호 해석 — 핫패스(헤더 등)에서 쓰는 **경량** 활성 검증.
 * 규칙(TITLES.md §1): 조건부 칭호는 표시 시점에 자격을 재검증해 미자격이면 숨긴다
 * (자동 해제 UPDATE 없음 — 조건 회복 시 자동 복귀).
 *
 * 검증 비용: 영구형 0쿼리 · 집행관 0쿼리(호출부의 executorZone 재사용) ·
 * 착용형/장비상태형 1쿼리 · 해방형 1쿼리. 그 외 조건부(랭킹 등 판정 미구현)는
 * 보수적으로 숨긴다 — 아직 발견 자체가 불가능한 코드라 실사용 영향 없음.
 */
export async function resolveRepTitle(
  repCode: string | null,
  userId: string,
  serverId: number,
  executorZone: string | null,
): Promise<string | null> {
  // 대표 미지정이면 기존 UX 유지 — 집행관은 자동 표시(집행관 표시 지점 승계).
  if (!repCode) return executorZone ? 'zone_executor' : null;

  const def = TITLE_BY_CODE.get(repCode);
  if (!def) return null;
  if (def.kind !== 'conditional') return repCode;

  if (def.style.executor) return executorZone ? repCode : null;

  const secret = TITLE_SECRET_BY_CODE.get(repCode);
  // 착용형/장비 상태형 — 장착 3행 조회 1회
  if (secret?.req || ['balance_master', 'full_armed', 'star_holder'].includes(repCode)) {
    const rows = (await db.execute(sql`
      select ci.code, ue.enhance_level from user_equipment ue
      join catalog_items ci on ci.id = ue.catalog_item_id
      where ue.user_id=${userId}::uuid and ue.server_id=${serverId} and ue.equipped_slot is not null
    `)) as unknown as { code: string; enhance_level: number }[];
    const eq = new Map(rows.map((r) => [r.code, Number(r.enhance_level)]));
    if (secret?.req) return secret.req.items.every((k) => (eq.get(k) ?? -1) >= secret.req!.min) ? repCode : null;
    const lv = [...eq.values()];
    if (repCode === 'balance_master') return lv.length === 3 && lv.every((v) => v === lv[0]) && lv[0]! >= 50 ? repCode : null;
    if (repCode === 'full_armed') return lv.length === 3 && lv.every((v) => v >= 100) ? repCode : null;
    return lv.some((v) => v >= 200) ? repCode : null; // star_holder
  }

  // 해방형 — 사전계산 스냅샷 1회
  if (['lib_holder', 'lib_ten', 'champ_5', 'armory_lord'].includes(repCode)) {
    const r = (await db.execute(sql`
      select count(*) filter (where rank<=3)::int as lib,
             count(*) filter (where rank=1)::int as champ,
             count(*) filter (where rank<=3 and ci.slot='weapon')::int as w
      from codex_champions cc join catalog_items ci on ci.id=cc.catalog_item_id
      where cc.user_id=${userId}::uuid and cc.server_id=${serverId}
    `)) as unknown as { lib: number; champ: number; w: number }[];
    const m = r[0] ?? { lib: 0, champ: 0, w: 0 };
    if (repCode === 'lib_holder') return Number(m.lib) >= 3 ? repCode : null;
    if (repCode === 'lib_ten') return Number(m.lib) >= 10 ? repCode : null;
    if (repCode === 'champ_5') return Number(m.champ) >= 5 ? repCode : null;
    return Number(m.w) >= 10 ? repCode : null;
  }

  // 판정 2차 조건부 — 코드별 표적 쿼리 1~2회(전체 지표 수집 없이)
  if (HEAVY_CONDITIONALS.has(repCode)) {
    return (await verifyHeavyConditional(repCode, userId, serverId)) ? repCode : null;
  }

  // 그 외 조건부 — 판정 붙기 전까지 보수적으로 숨김
  return null;
}

/** 판정 2차 조건부 — 표시 시점 재검증이 표적 쿼리로 가능한 코드. */
const HEAVY_CONDITIONALS = new Set([
  'rank_combat', 'rank_max', 'rank_sum', 'rank_raid', 'rank_melee', 'throne_shadow', 'uncrowned', 'rising_star',
  'broke_now', 'rich_apex', 'top_patron', 'guild_top', 'codex_live',
  'streak_king', 'march_live', 'smooth_sail',
  'melee_champion', 'melee_shame', 'raid_hero', 'open_king',
]);

const RANK_METRIC: Record<string, string> = {
  rank_combat: 'combat', rank_max: 'max', rank_sum: 'sum', rank_raid: 'raid', rank_melee: 'melee',
};
const KST = `at time zone 'Asia/Seoul'`;

/** 코드별 표적 재검증 — 핫패스(헤더)라 쿼리 1~2회 상한. 실패는 숨김으로 강등. */
async function verifyHeavyConditional(code: string, userId: string, serverId: number): Promise<boolean> {
  const u = sql`${userId}::uuid`;
  const s = sql`${serverId}`;
  try {
    if (RANK_METRIC[code] || code === 'throne_shadow' || code === 'uncrowned' || code === 'rising_star') {
      const rows = (await db.execute(sql`
        select m.metric, (select count(*)+1 from leaderboard_ranks lr
                 where lr.server_id=${s} and lr.metric=m.metric and lr.value > m.value)::int as pos
        from leaderboard_ranks m where m.server_id=${s} and m.user_id=${u}
      `)) as unknown as { metric: string; pos: number }[];
      const pos: Record<string, number> = { max: 9999, sum: 9999, combat: 9999, raid: 9999, melee: 9999 };
      for (const r of rows) pos[r.metric] = Number(r.pos);
      const metric = RANK_METRIC[code];
      if (metric) return pos[metric] === 1;
      const all = Object.values(pos);
      if (code === 'throne_shadow') return all.some((p) => p === 2);
      if (code === 'uncrowned') return all.every((p) => p >= 2 && p <= 3);
      // rising_star — 가입 30일 이내 + 전투력 100위 이내
      const [c] = (await db.execute(sql`
        select extract(day from now() - created_at)::int as days from characters
        where user_id=${u} and server_id=${s}
      `)) as unknown as { days: number }[];
      return Number(c?.days ?? 999) <= 30 && pos.combat! <= 100;
    }
    if (code === 'broke_now' || code === 'rich_apex') {
      const [r] = (await db.execute(sql`
        select c.diamond::bigint as dia,
               (select count(*) from characters c2 where c2.server_id=${s} and c2.diamond > c.diamond)::int as better
        from characters c where c.user_id=${u} and c.server_id=${s}
      `)) as unknown as { dia: string; better: number }[];
      if (!r) return false;
      return code === 'broke_now' ? Number(r.dia) === 0 : Number(r.better) === 0 && Number(r.dia) > 0;
    }
    if (code === 'top_patron') {
      const [r] = (await db.execute(sql`
        with sums as (select io.user_id, sum(io.amount_krw) t from iap_orders io
                      where io.status in ('paid','refunded') group by 1)
        select (exists(select 1 from sums where user_id=${u}))::int as has_pay,
               (select count(*)::int from sums s2
                 where s2.t > coalesce((select t from sums where user_id=${u}),0)) as better
      `)) as unknown as { has_pay: number; better: number }[];
      return Number(r?.has_pay) === 1 && Number(r?.better) === 0;
    }
    if (code === 'guild_top') {
      const [r] = (await db.execute(sql`
        select (select count(*) from guilds g3 where g3.server_id=${s} and g3.xp > g.xp)::int as better
        from guild_members gm join guilds g on g.id=gm.guild_id
        where gm.user_id=${u} and gm.server_id=${s}
      `)) as unknown as { better: number }[];
      return r != null && Number(r.better) === 0;
    }
    if (code === 'codex_live') {
      const [r] = (await db.execute(sql`
        select (select count(distinct ue.catalog_item_id) from user_equipment ue
                 join catalog_items ci on ci.id = ue.catalog_item_id and ci.active
                 where ue.user_id=${u} and ue.server_id=${s})::int as got,
               (select count(*) from catalog_items where active)::int as total
      `)) as unknown as { got: number; total: number }[];
      return Number(r?.total) > 0 && Number(r?.got) >= Number(r?.total);
    }
    if (code === 'streak_king' || code === 'march_live') {
      const src = code === 'streak_king'
        ? sql`select distinct kst_day::date dd from checkin_claim_logs where user_id=${u} and server_id=${s}`
        : sql`select distinct (ra.created_at ${sql.raw(KST)})::date dd
              from raid_attacks ra join raids r on r.id=ra.raid_id
              where ra.user_id=${u} and r.server_id=${s}`;
      const [r] = (await db.execute(sql`
        with d as (${src}),
             runs as (select dd, dd - (row_number() over (order by dd))::int as g from d),
             cur as (select count(*)::int len, max(dd) mx from runs
                     where g = (select g from runs order by dd desc limit 1))
        select coalesce((select case when mx >= (now() ${sql.raw(KST)})::date - 1 then len else 0 end from cur),0)::int as len
      `)) as unknown as { len: number }[];
      return Number(r?.len ?? 0) >= (code === 'streak_king' ? 30 : 7);
    }
    if (code === 'smooth_sail') {
      const [r] = (await db.execute(sql`
        select (count(*)=20 and count(*) filter (where result='down')=0)::int as ok
        from (select result from enhancement_logs where user_id=${u} and server_id=${s}
              order by id desc limit 20) t
      `)) as unknown as { ok: number }[];
      return Number(r?.ok) === 1;
    }
    if (code === 'melee_champion' || code === 'melee_shame') {
      const [r] = (await db.execute(sql`
        select (mp.final_rank=1)::int as win, (mp.final_rank=mb.participant_count)::int as last
        from melee_participants mp join melee_battles mb on mb.id=mp.battle_id
        where mp.user_id=${u} and mb.server_id=${s} and mb.status='revealed'
          and mb.battle_date = (now() ${sql.raw(KST)})::date - 1
      `)) as unknown as { win: number; last: number }[];
      return code === 'melee_champion' ? Number(r?.win) === 1 : Number(r?.last) === 1;
    }
    if (code === 'raid_hero') {
      const [r] = (await db.execute(sql`
        select (rk.user_id = ${u})::int as top from (
          select ra.user_id, sum(ra.damage) dmg from raid_attacks ra join raids r on r.id=ra.raid_id
          where r.server_id=${s} and (ra.created_at ${sql.raw(KST)})::date = (now() ${sql.raw(KST)})::date - 1
          group by 1 order by 2 desc, 1 limit 1) rk
      `)) as unknown as { top: number }[];
      return Number(r?.top) === 1;
    }
    if (code === 'open_king') {
      const [r] = (await db.execute(sql`
        select (rk.user_id = ${u})::int as top from (
          select user_id, count(*) c from supply_open_logs
          where server_id=${s} and (created_at ${sql.raw(KST)})::date = (now() ${sql.raw(KST)})::date - 1
          group by 1 order by 2 desc, 1 limit 1) rk
      `)) as unknown as { top: number }[];
      return Number(r?.top) === 1;
    }
    return false;
  } catch {
    return false; // 검증 실패 = 표시만 숨김(치명 아님)
  }
}

/** OG(정적 렌더)용 — 이펙트 클래스 대신 대표색 1개로 강등. */
const FX_OG: Record<string, string> = {
  goldflow: '#e5c07b', goldglow: '#e5c07b', goldleaf: '#e0b860', goldsoft: '#e5c07b', imperial: '#e5c07b',
  emberflow: '#ff9d4d', crimsonflow: '#e05252', violetflow: '#b98ef0', violetglow: '#c9a2f0',
  steelshine: '#c8ccd8', chrome: '#c8d2dc', emboss: '#d4dae4', silverglow: '#c8ccd8',
  royalflow: '#e5c07b', staticazure: '#6ea8e0', verdantflow: '#7fce8a', nightstar: '#aab8f0', milkyway: '#c8d8f0',
  pentaflow: '#e5c07b', bloodpulse: '#e05252', flame: '#f0a860', staticember: '#f0a860', staticgold: '#e5c07b',
  neon: '#8beaf8', aurora: '#7ec8c8', moonlight: '#cfd8e8', duskfade: '#f0a860', frostedge: '#bfe3ff',
  yinyang: '#f5d76e', silk: '#d88ca0', breath: '#b9c2cc', obsidian: '#8a84a0', pearl: '#e0d8f0',
  inkwash: '#b8bec8', candle: '#f0c890', firstlight: '#e8cf9a', jade: '#8fd4ae', rimlight: '#f0e2b0',
  sparkstatic: '#ffe066', slimeflow: '#8fce6e', duststatic: '#d0a878', ashstatic: '#b8aec8', abyssglow: '#9a7bd4',
  starlight: '#f5d76e', iceflow: '#9fd4f0',
};

export type OgTitleSeg = { text: string; color: string };

/** OG 카드용 세그먼트 — 집행관은 기존 2색(구역=지역색·집행관=인디고) 유지, 그 외 단색. */
export function repTitleOgSegs(
  code: string,
  executorZone: string | null,
  executorZoneRegion: string | null,
  regionColor: Record<string, string>,
): OgTitleSeg[] {
  const def = TITLE_BY_CODE.get(code);
  if (!def) return [];
  if (def.style.executor) {
    if (!executorZone) return [];
    return [
      { text: executorZone, color: regionColor[executorZoneRegion ?? ''] ?? '#a5b4fc' },
      { text: ' 집행관', color: '#a5b4fc' },
    ];
  }
  const color = def.style.color ?? def.style.gradient?.[0] ?? FX_OG[def.style.fx ?? ''] ?? '#a5b4fc';
  return [{ text: def.label, color }];
}

/**
 * 여러 유저의 표시용 대표 칭호 일괄 해석(채팅·목록용) — 배치 2쿼리 상한.
 * 반환: userId → 표시 code(null=미표시).
 */
export async function resolveRepTitlesBatch(
  entries: { userId: string; repCode: string | null; executorZone: string | null }[],
  serverId: number,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const needEquip: { userId: string; code: string }[] = [];
  const needLib: { userId: string; code: string }[] = [];
  const needHeavy: { userId: string; code: string }[] = [];

  for (const e of entries) {
    if (!e.repCode) {
      out.set(e.userId, e.executorZone ? 'zone_executor' : null);
      continue;
    }
    const def = TITLE_BY_CODE.get(e.repCode);
    if (!def) { out.set(e.userId, null); continue; }
    if (def.kind !== 'conditional') { out.set(e.userId, e.repCode); continue; }
    if (def.style.executor) { out.set(e.userId, e.executorZone ? e.repCode : null); continue; }
    const secret = TITLE_SECRET_BY_CODE.get(e.repCode);
    if (secret?.req || ['balance_master', 'full_armed', 'star_holder'].includes(e.repCode)) {
      needEquip.push({ userId: e.userId, code: e.repCode });
    } else if (['lib_holder', 'lib_ten', 'champ_5', 'armory_lord'].includes(e.repCode)) {
      needLib.push({ userId: e.userId, code: e.repCode });
    } else if (HEAVY_CONDITIONALS.has(e.repCode)) {
      needHeavy.push({ userId: e.userId, code: e.repCode });
    } else {
      out.set(e.userId, null); // 판정 미구현 조건부 — 보수적 숨김
    }
  }

  if (needEquip.length) {
    const ids = needEquip.map((n) => n.userId);
    const rows = (await db.execute(sql`
      select ue.user_id::text as uid, ci.code, ue.enhance_level from user_equipment ue
      join catalog_items ci on ci.id = ue.catalog_item_id
      where ue.server_id=${serverId} and ue.equipped_slot is not null
        and ue.user_id in (select unnest(array[${sql.join(ids.map((i) => sql`${i}`), sql`, `)}]::uuid[]))
    `)) as unknown as { uid: string; code: string; enhance_level: number }[];
    const byUser = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!byUser.has(r.uid)) byUser.set(r.uid, new Map());
      byUser.get(r.uid)!.set(r.code, Number(r.enhance_level));
    }
    for (const n of needEquip) {
      const eq = byUser.get(n.userId) ?? new Map<string, number>();
      const secret = TITLE_SECRET_BY_CODE.get(n.code);
      let ok = false;
      if (secret?.req) ok = secret.req.items.every((k) => (eq.get(k) ?? -1) >= secret.req!.min);
      else {
        const lv = [...eq.values()];
        if (n.code === 'balance_master') ok = lv.length === 3 && lv.every((v) => v === lv[0]) && lv[0]! >= 50;
        else if (n.code === 'full_armed') ok = lv.length === 3 && lv.every((v) => v >= 100);
        else ok = lv.some((v) => v >= 200);
      }
      out.set(n.userId, ok ? n.code : null);
    }
  }

  if (needLib.length) {
    const ids = needLib.map((n) => n.userId);
    const rows = (await db.execute(sql`
      select cc.user_id::text as uid,
             count(*) filter (where rank<=3)::int as lib,
             count(*) filter (where rank=1)::int as champ,
             count(*) filter (where rank<=3 and ci.slot='weapon')::int as w
      from codex_champions cc join catalog_items ci on ci.id=cc.catalog_item_id
      where cc.server_id=${serverId}
        and cc.user_id in (select unnest(array[${sql.join(ids.map((i) => sql`${i}`), sql`, `)}]::uuid[]))
      group by cc.user_id
    `)) as unknown as { uid: string; lib: number; champ: number; w: number }[];
    const byUser = new Map(rows.map((r) => [r.uid, r]));
    for (const n of needLib) {
      const m = byUser.get(n.userId) ?? { lib: 0, champ: 0, w: 0 };
      const ok = n.code === 'lib_holder' ? Number(m.lib) >= 3
        : n.code === 'lib_ten' ? Number(m.lib) >= 10
        : n.code === 'champ_5' ? Number(m.champ) >= 5
        : Number(m.w) >= 10;
      out.set(n.userId, ok ? n.code : null);
    }
  }

  // 판정 2차 조건부 — 드문 케이스라 개별 표적 검증(동시 소수)
  if (needHeavy.length) {
    await Promise.all(needHeavy.map(async (n) => {
      const ok = await verifyHeavyConditional(n.code, n.userId, serverId);
      out.set(n.userId, ok ? n.code : null);
    }));
  }

  return out;
}
