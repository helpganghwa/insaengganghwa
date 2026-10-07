import 'server-only';

import { sql } from 'drizzle-orm';
import { josa } from 'josa';

import { db } from '@/lib/db/client';
import { WORLD_BOSS_GUILD_XP_PER_STAGE, WORLD_BOSS_SPAWN_KST_HOURS, WORLD_BOSS_STAY_MS, guildXpToNext } from '@/lib/game/guild/balance';
import { sendPushToUsers } from '@/lib/push/send';
import { kstDateString, kstStartOfDay } from '@/lib/kst';

import { worldBossName } from './bosses';

/**
 * 월드보스 생애(docs/WORLD-BOSS.md §1·§4·§5) — 크론(/api/cron/world-boss, 5분)이 서버마다 차례로 부른다.
 *  ① ensureTodayBoss: 그날 행이 없으면 출현 시각(09~21시 분 단위)과 점령 구역을 추첨해 '예정'으로 만든다.
 *  ② activateDueBosses: 출현 시각이 지난 '예정' → '출현'(월드 피드 + 주인 길드 푸시).
 *  ③ settleLeftBosses: 떠나는 시각이 지난 '출현' → 정산(그 순간의 구역 주인 길드 금고에 전리품·길드 경험치, 우편)
 *     → '떠남'. 출발하지 않은 원정대는 해산.
 * 전부 멱등 — 조건부 UPDATE·유니크 키라 두 틱이 겹쳐도 한 번만 적용된다.
 */

const HOUR = 60 * 60 * 1000;

function rngU32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

/** 그날 보스가 없으면 만든다. 창(09~21시)이 지났거나 점령 구역이 없으면 그날은 건너뛴다. */
export async function ensureTodayBoss(
  serverId: number,
  now: Date = new Date(),
): Promise<{ created: boolean; bossId?: string; skipped?: 'exists' | 'window_passed' | 'no_owned_zone' | 'race' }> {
  const kstDay = kstDateString(now);
  const [exists] = (await db.execute(sql`select id::text as id from world_bosses where server_id = ${serverId} and kst_day = ${kstDay}::date`)) as unknown as { id: string }[];
  if (exists) return { created: false, bossId: exists.id, skipped: 'exists' };

  const dayStart = kstStartOfDay(now).getTime();
  const windowStart = dayStart + WORLD_BOSS_SPAWN_KST_HOURS.from * HOUR;
  const windowEnd = dayStart + WORLD_BOSS_SPAWN_KST_HOURS.to * HOUR;
  // 크론이 늦게 떴어도 남은 창 안에서 뽑는다(분 단위 올림). 창이 지났으면 그날은 없다.
  const lower = Math.ceil(Math.max(now.getTime(), windowStart) / 60_000) * 60_000;
  if (lower >= windowEnd) return { created: false, skipped: 'window_passed' };
  const minutes = Math.floor((windowEnd - lower) / 60_000);
  const spawnAt = new Date(lower + (rngU32() % minutes) * 60_000);
  const leaveAt = new Date(spawnAt.getTime() + WORLD_BOSS_STAY_MS);

  // 점령된 구역 중 보스가 없는(예정·출현 중이 아닌) 곳에서 균등 추첨 — 구역 수 비례(쏠림은 의도, 완화 없음).
  const zonesRows = (await db.execute(sql`
    select z.id, z.region::text as region, z.owner_guild_id::text as owner
      from zones z
     where z.server_id = ${serverId} and z.owner_guild_id is not null
       and not exists (select 1 from world_bosses b where b.zone_id = z.id and b.status in ('scheduled', 'active'))
  `)) as unknown as { id: number; region: string; owner: string }[];
  if (zonesRows.length === 0) return { created: false, skipped: 'no_owned_zone' };
  const pick = zonesRows[rngU32() % zonesRows.length]!;

  const [ins] = (await db.execute(sql`
    insert into world_bosses (server_id, zone_id, region, kst_day, spawn_at, leave_at, status, spawn_owner_guild_id)
    values (${serverId}, ${pick.id}, ${pick.region}, ${kstDay}::date, ${spawnAt.toISOString()}, ${leaveAt.toISOString()}, 'scheduled', ${pick.owner}::bigint)
    on conflict (server_id, kst_day) do nothing
    returning id::text as id
  `)) as unknown as { id: string }[];
  if (!ins) return { created: false, skipped: 'race' };
  return { created: true, bossId: ins.id };
}

type Activated = { id: string; zone_id: number; zone_name: string; region: string; owner: string | null; owner_name: string | null };

/** 출현 시각이 지난 '예정' 보스를 '출현'으로. 월드 피드 + 주인 길드원 푸시. */
export async function activateDueBosses(serverId: number): Promise<Activated[]> {
  const rows = (await db.execute(sql`
    with up as (
      update world_bosses b set status = 'active'
       where b.server_id = ${serverId} and b.status = 'scheduled' and b.spawn_at <= now()
      returning b.id, b.zone_id, b.region
    )
    select up.id::text as id, up.zone_id, z.name as zone_name, up.region::text as region,
           z.owner_guild_id::text as owner, g.name as owner_name
      from up join zones z on z.id = up.zone_id left join guilds g on g.id = z.owner_guild_id
  `)) as unknown as Activated[];
  for (const b of rows) {
    const bossName = worldBossName(b.region);
    await db
      .execute(
        sql`insert into world_events (server_id, type, guild_id, detail)
            values (${serverId}, 'world_boss_spawn', ${b.owner}::bigint,
                    ${JSON.stringify({ bossId: b.id, zoneId: b.zone_id, zoneName: b.zone_name, region: b.region, bossName, guildName: b.owner_name })}::jsonb)`,
      )
      .catch((e) => console.warn('[world-boss] spawn event failed', b.id, e));
    if (b.owner) {
      const members = (await db.execute(sql`select user_id from guild_members where guild_id = ${b.owner}::bigint and server_id = ${serverId}`)) as unknown as { user_id: string }[];
      await sendPushToUsers(members.map((m) => m.user_id), {
        title: '월드보스 출현',
        body: josa(`${b.zone_name}에 ${bossName}#{이} 나타났어요. 원정대를 꾸려 보세요.`),
        url: '/world-boss',
        tag: `world-boss-${b.id}`,
        category: 'world_boss',
      }).catch((e) => console.warn('[world-boss] spawn push failed', b.id, e));
    }
  }
  return rows;
}

/** 누적 XP에 레벨 임계를 차감하며 레벨업(길드 기부와 같은 식). */
function applyGuildLevelUp(level: number, xp: bigint): { level: number; xp: bigint } {
  let lv = level;
  let rem = xp;
  while (rem >= BigInt(guildXpToNext(lv))) {
    rem -= BigInt(guildXpToNext(lv));
    lv += 1;
  }
  return { level: lv, xp: rem };
}

export type SettledBoss = { id: string; zoneName: string; region: string; stage: number; lootDiamond: number; lootBoxes: number; guildId: string | null; guildName: string | null; disbanded: number };

/**
 * 떠나는 시각이 지난 보스를 정산한다 — 보스마다 한 트랜잭션. 그 순간의 구역 주인 길드가 전리품(💎·📦)을
 * 금고로 **바로** 받고(집행관 몫 없음, 수금 쿨타임 무관), 단계당 길드 경험치를 얻는다. 중립이면 전리품은 소멸.
 * 출발하지 않은 원정대는 해산하고 참가자·신청을 지운다(싸운 기록은 그대로).
 */
export async function settleLeftBosses(serverId: number): Promise<SettledBoss[]> {
  const due = (await db.execute(sql`
    select id::text as id from world_bosses where server_id = ${serverId} and status = 'active' and leave_at <= now() order by leave_at
  `)) as unknown as { id: string }[];
  const out: SettledBoss[] = [];
  for (const { id } of due) {
    const settled = await db.transaction(async (tx) => {
      const [b] = (await tx.execute(sql`
        select b.id::text as id, b.zone_id, b.region::text as region, b.stage, b.loot_diamond::text as loot_diamond, b.loot_boxes,
               z.name as zone_name, z.owner_guild_id::text as owner, g.name as owner_name
          from world_bosses b join zones z on z.id = b.zone_id left join guilds g on g.id = z.owner_guild_id
         where b.id = ${id}::bigint and b.status = 'active' and b.leave_at <= now()
         for update of b
      `)) as unknown as { id: string; zone_id: number; region: string; stage: number; loot_diamond: string; loot_boxes: number; zone_name: string; owner: string | null; owner_name: string | null }[];
      if (!b) return null; // 다른 틱이 먼저 정산
      const loot = { diamond: Number(b.loot_diamond), boxes: Number(b.loot_boxes) };
      const bossName = worldBossName(b.region);

      if (b.owner) {
        const [g] = (await tx.execute(sql`select level, xp::text as xp from guilds where id = ${b.owner}::bigint for update`)) as unknown as { level: number; xp: string }[];
        if (g) {
          const next = applyGuildLevelUp(Number(g.level), BigInt(g.xp) + BigInt(b.stage * WORLD_BOSS_GUILD_XP_PER_STAGE));
          await tx.execute(sql`
            update guilds set tax_pool_diamond = tax_pool_diamond + ${loot.diamond}::bigint,
                              tax_pool_boxes = tax_pool_boxes + ${loot.boxes},
                              level = ${next.level}, xp = ${next.xp.toString()}::bigint
             where id = ${b.owner}::bigint`);
          const body =
            `${b.zone_name}의 ${bossName}#{이} 떠났어요. ${b.stage}단계까지 올렸고, 길드 금고에 💎${loot.diamond.toLocaleString('ko-KR')}·📦${loot.boxes.toLocaleString('ko-KR')} 전리품이 들어왔어요.\n` +
            `길드 관리의 세금 분배에서 나눌 수 있어요.`;
          await tx.execute(sql`
            insert into mailbox (user_id, server_id, type, title, body, sender_label, payload, expires_at)
            select gm.user_id, ${serverId}, 'world_boss'::mailbox_type, '월드보스 전리품', ${josa(body)}, '월드보스', '{}'::jsonb, now() + interval '30 days'
              from guild_members gm where gm.guild_id = ${b.owner}::bigint and gm.server_id = ${serverId}`);
        }
      }

      await tx.execute(sql`
        update world_bosses set status = 'left', settled_guild_id = ${b.owner}::bigint, settled_at = now() where id = ${id}::bigint`);
      // 출발하지 않은 원정대 해산 — 참가자·신청도 지운다(싸운 기록은 departed 행에 남는다).
      const dis = (await tx.execute(sql`
        update world_boss_parties set status = 'disbanded', disband_reason = 'boss_left'
         where boss_id = ${id}::bigint and status = 'recruiting' returning id`)) as unknown as { id: string }[];
      if (dis.length > 0) {
        await tx.execute(sql`delete from world_boss_party_members m using world_boss_parties p where m.party_id = p.id and p.boss_id = ${id}::bigint and p.status = 'disbanded'`);
        await tx.execute(sql`delete from world_boss_join_requests r using world_boss_parties p where r.party_id = p.id and p.boss_id = ${id}::bigint and p.status = 'disbanded'`);
      }
      await tx.execute(sql`
        insert into world_events (server_id, type, guild_id, detail)
        values (${serverId}, 'world_boss_left', ${b.owner}::bigint,
                ${JSON.stringify({ bossId: id, zoneId: b.zone_id, zoneName: b.zone_name, region: b.region, bossName, guildName: b.owner_name, stage: b.stage, lootDiamond: loot.diamond, lootBoxes: loot.boxes })}::jsonb)`);
      return { id, zoneName: b.zone_name, region: b.region, stage: Number(b.stage), lootDiamond: loot.diamond, lootBoxes: loot.boxes, guildId: b.owner, guildName: b.owner_name, disbanded: dis.length } satisfies SettledBoss;
    });
    if (!settled) continue;
    out.push(settled);
    if (settled.guildId) {
      const members = (await db.execute(sql`select user_id from guild_members where guild_id = ${settled.guildId}::bigint and server_id = ${serverId}`)) as unknown as { user_id: string }[];
      await sendPushToUsers(members.map((m) => m.user_id), {
        title: '월드보스 전리품',
        body: josa(`${settled.zoneName}의 ${worldBossName(settled.region)}#{이} 떠나며 길드 금고에 💎${settled.lootDiamond.toLocaleString('ko-KR')}·📦${settled.lootBoxes.toLocaleString('ko-KR')} 전리품을 남겼어요.`),
        url: '/guild/distribute',
        tag: `world-boss-left-${settled.id}`,
        category: 'world_boss',
      }).catch((e) => console.warn('[world-boss] left push failed', settled.id, e));
    }
  }
  return out;
}
