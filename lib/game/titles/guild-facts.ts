import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

/**
 * 길드 단위 조건부 칭호(2026-09-01, 9종 14코드) — 판정(judge.activeConditionals)과 표시 재검증
 * (display.verifyHeavyConditional)이 **같은 사실표**를 쓴다. 전부 "지금 그런 동안"이라 저장하지 않는다.
 *
 *  - guild_officer        부길드장(role='vice')
 *  - guild_top_contrib    소속 길드 안에서 기여도 1위(단독)
 *  - guild_old_100        결성 100일 넘은 길드 소속
 *  - guild_top_combat     길드 전투력(멤버 combat 합) 서버 1위 — 랭킹 탭 '전투력'과 동일 산식
 *  - guild_top_zones      점령 구역 수 서버 1위(단독)
 *  - guild_top_tax        세금 곳간(tax_pool_diamond) 서버 1위(단독, 0 초과)
 *  - guild_zones_25       구역 25개 이상 보유
 *  - guild_no_loss_7d     최근 7일 zone_lost 0건 + 그 기간 소유 구역 전투 1회 이상(싸우고도 안 잃음)
 *  - region_owner_<r>     권역 완전장악 — recalcTaxBonus의 완전장악 판정과 동일(방치 구역 제외)
 *
 * 1위는 **단독**만 인정(동률이면 아무도 아님) — 명가(guild_top)의 (level,xp) 사전식과 달리 2차 키 없이
 * 값이 같으면 공동 1위로 보고 비활성. 길드 미가입이면 빈 집합.
 */
export const GUILD_COLLECTIVE_CODES: ReadonlySet<string> = new Set([
  'guild_officer', 'guild_top_contrib', 'guild_old_100',
  'guild_top_combat', 'guild_top_zones', 'guild_top_tax', 'guild_zones_25', 'guild_no_loss_7d',
  'region_owner_volcano', 'region_owner_temple', 'region_owner_swamp', 'region_owner_orc', 'region_owner_kingdom', 'region_owner_angel',
]);

type Row = {
  role: string; contrib_top: number; age_days: number;
  combat_top: number; zones_top: number; tax_top: number; zones: number; no_loss_7d: number;
  full_regions: string[] | null;
};

export async function guildCollectiveCodes(userId: string, serverId: number): Promise<Set<string>> {
  const u = sql`${userId}::uuid`;
  const s = sql`${serverId}`;
  const rows = (await db.execute(sql`
    with me as (
      select gm.guild_id, gm.role, gm.contribution_points, g.created_at, g.tax_pool_diamond
      from guild_members gm join guilds g on g.id = gm.guild_id
      where gm.user_id = ${u} and gm.server_id = ${s}
    ),
    gcombat as (
      select gm.guild_id, coalesce(sum(lr.value), 0)::bigint as combat
      from guild_members gm
      left join leaderboard_ranks lr on lr.user_id = gm.user_id and lr.server_id = gm.server_id and lr.metric = 'combat'
      where gm.server_id = ${s}
      group by gm.guild_id
    ),
    gzones as (
      select owner_guild_id as guild_id, count(*)::int as zones from zones
      where server_id = ${s} and owner_guild_id is not null group by owner_guild_id
    )
    select
      me.role,
      -- 길드 내 기여도 단독 1위
      (me.contribution_points > 0 and not exists (
         select 1 from guild_members g2 where g2.guild_id = me.guild_id and g2.user_id <> ${u}
           and g2.contribution_points >= me.contribution_points))::int as contrib_top,
      extract(day from now() - me.created_at)::int as age_days,
      -- 서버 단독 1위 3종
      (not exists (select 1 from gcombat c2 where c2.guild_id <> me.guild_id
         and c2.combat >= (select combat from gcombat where guild_id = me.guild_id))
       and coalesce((select combat from gcombat where guild_id = me.guild_id), 0) > 0)::int as combat_top,
      (coalesce((select zones from gzones where guild_id = me.guild_id), 0) > 0 and not exists (
         select 1 from gzones z2 where z2.guild_id <> me.guild_id
           and z2.zones >= (select zones from gzones where guild_id = me.guild_id)))::int as zones_top,
      (me.tax_pool_diamond > 0 and not exists (
         select 1 from guilds g3 where g3.server_id = ${s} and g3.id <> me.guild_id
           and g3.tax_pool_diamond >= me.tax_pool_diamond))::int as tax_top,
      coalesce((select zones from gzones where guild_id = me.guild_id), 0)::int as zones,
      -- 난공불락: 7일간 zone_lost 0 + 소유 구역에서 치른 전투 1회 이상
      (not exists (select 1 from guild_audit_log a where a.guild_id = me.guild_id and a.action = 'zone_lost'
                     and a.created_at > now() - interval '7 days')
       and exists (select 1 from conquest_battles cb join zones z on z.id = cb.zone_id
                     where cb.server_id = ${s} and z.owner_guild_id = me.guild_id
                       and cb.created_at > now() - interval '7 days'))::int as no_loss_7d,
      -- 완전장악 권역(방치 구역 제외) — recalcTaxBonus와 동일 기준
      (select array_agg(region::text) from (
         select z3.region from zones z3 where z3.server_id = ${s}
         group by z3.region
         having count(*) = count(*) filter (where z3.owner_guild_id = me.guild_id and z3.abandoned_day is null)
       ) fr) as full_regions
    from me
  `)) as unknown as Row[];
  const out = new Set<string>();
  const r = rows[0];
  if (!r) return out;
  if (r.role === 'vice') out.add('guild_officer');
  if (Number(r.contrib_top) === 1) out.add('guild_top_contrib');
  if (Number(r.age_days) >= 100) out.add('guild_old_100');
  if (Number(r.combat_top) === 1) out.add('guild_top_combat');
  if (Number(r.zones_top) === 1) out.add('guild_top_zones');
  if (Number(r.tax_top) === 1) out.add('guild_top_tax');
  if (Number(r.zones) >= 25) out.add('guild_zones_25');
  if (Number(r.no_loss_7d) === 1) out.add('guild_no_loss_7d');
  for (const reg of r.full_regions ?? []) {
    const code = `region_owner_${reg}`;
    if (GUILD_COLLECTIVE_CODES.has(code)) out.add(code);
  }
  return out;
}

/** 표시 재검증용 60초 캐시 — 한 유저의 14코드를 한 번의 쿼리로. */
const cache = new Map<string, { at: number; codes: Set<string> }>();
const TTL = 60_000;
export async function guildCollectiveCodesCached(userId: string, serverId: number): Promise<Set<string>> {
  const k = `${userId}:${serverId}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.codes;
  const codes = await guildCollectiveCodes(userId, serverId);
  cache.set(k, { at: Date.now(), codes });
  if (cache.size > 2000) cache.clear();
  return codes;
}
