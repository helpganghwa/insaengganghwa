import 'server-only';

import { sql } from 'drizzle-orm';
import { josa } from 'josa';

import { afterResponse } from '@/lib/push/defer';
import { logGuildAudit } from '@/lib/game/guild/audit';

import { db } from '@/lib/db/client';
import { logWorldEvent } from '@/lib/game/world/event';
import { raiseOpsAlert } from '@/lib/ops/alert';
import { sendPushToUsers } from '@/lib/push/send';
import { worldBossKind, worldBossName } from './bosses';

/**
 * 월드보스 생애(docs/WORLD-BOSS.md §1·§4·§5) — 크론(/api/cron/world-boss, 5분)이 서버마다 차례로 부른다.
 *  ① activateDueBosses: 출현 시각이 지난 '예정' → '출현'(월드 피드 + 그 서버 전체 푸시, 토글 켠 사람). 소환 자체는 관리자(admin.ts, 10-11)가 한다.
 *  ② settleLeftBosses: 떠나는 시각이 지난 '출현' → 정산(그 순간의 구역 주인 길드 세금에 전리품, 우편 — 길드 경험치는 주지 않는다, 10-11 사용자)
 *     → '떠남'. 출발하지 않은 원정대는 해산.
 * 전부 멱등 — 조건부 UPDATE라 두 틱이 겹쳐도 한 번만 적용된다.
 */

type Activated = { id: string; zone_id: number; zone_name: string; region: string; boss_code: string; owner: string | null; owner_name: string | null };

/** 출현 시각이 지난 '예정' 보스를 '출현'으로. 월드 피드 + 그 서버에 있는 모든 유저에게 푸시(10-11 사용자: 주인 길드원만 → 알림 켠 전원). */
/** 테스트·관리자 즉시 소환용 — 지정한 보스만 다룬다(스테이징 lifecycle 테스트가 실제 보스를 정산하지 않게, 10-11 재검사). 크론은 지정하지 않는다. */
export type CronScope = { onlyBossIds?: string[] };
function scopeSql(scope: CronScope | undefined, col: ReturnType<typeof sql>) {
  const ids = (scope?.onlyBossIds ?? []).filter((x) => /^\d{1,18}$/.test(x));
  return scope?.onlyBossIds ? sql`and ${col} = any(${`{${ids.join(',')}}`}::bigint[])` : sql``;
}

export async function activateDueBosses(serverId: number, scope?: CronScope): Promise<Activated[]> {
  const rows = (await db.execute(sql`
    with up as (
      update world_bosses b set status = 'active', spawn_owner_guild_id = (select z.owner_guild_id from zones z where z.id = b.zone_id)
       where b.server_id = ${serverId} and b.status = 'scheduled' and b.spawn_at <= now() ${scopeSql(scope, sql`b.id`)}
      returning b.id, b.zone_id, b.region, b.boss_code
    )
    select up.id::text as id, up.zone_id, z.name as zone_name, up.region::text as region, up.boss_code::text as boss_code,
           z.owner_guild_id::text as owner, g.name as owner_name
      from up join zones z on z.id = up.zone_id left join guilds g on g.id = z.owner_guild_id
  `)) as unknown as Activated[];
  for (const b of rows) {
    const bossName = worldBossName(b.boss_code);
    try {
    // 월드 로그 + 채팅 시스템 줄(10-11 사용자: 홈 배너·팝업 대신 로그로 알림) — logWorldEvent가 피드 캐시 무효화·채팅 방송까지 한다.
    await logWorldEvent(serverId, 'world_boss_spawn', { bossId: b.id, zoneId: b.zone_id, zoneName: b.zone_name, region: b.region, bossCode: b.boss_code, bossName, guildName: b.owner_name }, b.owner ? { guildId: BigInt(b.owner) } : undefined);
    // 서버 전원 푸시는 응답(크론·어드민 즉시 소환) 뒤에 — 수백 건 발송이 크론 틱이나 어드민 응답을 붙잡지 않게(10-11 3차 성능 감사).
    afterResponse(async () => {
      // 구독이 있고 지금 이 서버에 있는 사람 전부(경계규칙 1). 토글(push_world_boss)은 sendPushToUsers가 다시 거른다.
      const members = (await db.execute(sql`
        select distinct p.id::text as user_id from profiles p join push_subscriptions ps on ps.user_id = p.id
         where p.last_server_id = ${serverId} and p.push_world_boss`)) as unknown as { user_id: string }[];
      await sendPushToUsers(members.map((m) => m.user_id), {
        title: '월드보스 출현',
        body: josa(`${b.zone_name}에 ${bossName}#{이} 나타났어요.`), // 짧게(10-11 사용자 B안) — 누르면 보스 상세.
        url: `/world-boss/${b.id}`,
        serverId,
        tag: `world-boss-${b.id}`,
        category: 'world_boss',
      }).catch((e) => console.warn('[world-boss] spawn push failed', b.id, e));
    });
    } catch (e) {
      // 한 보스의 로그·푸시 예약이 실패해도 다음 보스와 같은 틱의 정산은 계속(10-11 3차). 출현 자체는 이미 커밋됐다.
      console.error('[world-boss] spawn side effects failed', b.id, e);
    }
  }
  return rows;
}

export type SettledBoss = { id: string; zoneId: number; zoneName: string; region: string; bossCode: string; stage: number; lootDiamond: number; lootBoxes: number; guildId: string | null; guildName: string | null; disbanded: number };

/**
 * 떠나는 시각이 지난 보스를 정산한다 — 보스마다 한 트랜잭션. 그 순간의 구역 주인 길드가 전리품(💎·📦)을
 * 길드 세금으로 **바로** 받는다(집행관 몫 없음, 수금 쿨타임 무관). 길드 경험치는 주지 않는다(10-11 사용자 삭제). 중립이면 전리품은 소멸.
 * 출발하지 않은 원정대는 해산하고 참가자·신청을 지운다(싸운 기록은 그대로).
 */
export async function settleLeftBosses(serverId: number, scope?: CronScope): Promise<SettledBoss[]> {
  const due = (await db.execute(sql`
    select id::text as id from world_bosses where server_id = ${serverId} and status = 'active' and leave_at <= now() ${scopeSql(scope, sql`id`)} order by leave_at
  `)) as unknown as { id: string }[];
  const out: SettledBoss[] = [];
  for (const { id } of due) {
    let settled: SettledBoss | null;
    try {
      settled = await settleOne(serverId, id);
    } catch (e) {
      // 보스 하나가 실패해도 나머지는 정산한다(10-11 재검사). 같은 보스가 매 틱 실패하면 운영 알림이 매번 간다 — 조용히 멈추지 않게.
      console.error('[world-boss] settle failed', id, e);
      await raiseOpsAlert('월드보스 정산 실패', `boss ${id} (server ${serverId}): ${(e as Error)?.message ?? String(e)}`).catch(() => undefined);
      continue;
    }
    if (!settled) continue;
    out.push(settled);
    // 월드 로그 + 채팅 시스템 줄 — 트랜잭션 밖(best-effort). 정산이 확정된 뒤에만 알린다. 전리품 0(0페이즈)이면 로그 문구가 '남긴 전리품 없이'로 갈린다(world-message).
    await logWorldEvent(serverId, 'world_boss_left', { bossId: settled.id, zoneId: settled.zoneId, zoneName: settled.zoneName, region: settled.region, bossCode: settled.bossCode, bossName: worldBossName(settled.bossCode), guildName: settled.guildName, stage: settled.stage, lootDiamond: settled.lootDiamond, lootBoxes: settled.lootBoxes }, settled.guildId ? { guildId: BigInt(settled.guildId) } : undefined);
    // 원정 종료 푸시는 보내지 않는다(10-11 사용자) — 전리품 우편·월드 로그·채팅 줄로 충분하다.
  }
  return out;
}

/** 보스 하나 정산(한 트랜잭션). 다른 틱이 먼저 정산했으면 null. */
async function settleOne(serverId: number, id: string): Promise<SettledBoss | null> {
  return db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '3s'`); // 정산도 잠금 대기 상한(10-11 3차)
      const [b] = (await tx.execute(sql`
        select b.id::text as id, b.zone_id, b.region::text as region, b.boss_code::text as boss_code, b.stage, b.loot_diamond::text as loot_diamond, b.loot_boxes,
               z.name as zone_name, z.owner_guild_id::text as owner, g.name as owner_name
          from world_bosses b join zones z on z.id = b.zone_id left join guilds g on g.id = z.owner_guild_id
         where b.id = ${id}::bigint and b.status = 'active' and b.leave_at <= now()
         for update of b
      `)) as unknown as { id: string; zone_id: number; region: string; boss_code: string; stage: number; loot_diamond: string; loot_boxes: number; zone_name: string; owner: string | null; owner_name: string | null }[];
      if (!b) return null; // 다른 틱이 먼저 정산
      const loot = { diamond: Number(b.loot_diamond), boxes: Number(b.loot_boxes) };
      const bossName = worldBossName(b.boss_code);
      const leave = worldBossKind(b.boss_code).lines.leave;

      // 길드 행을 실제로 읽었을 때만 그 길드에 귀속한다 — 주인을 읽은 뒤 길드가 해산되면 FK 위반으로 정산이 깨졌다(10-11 재검사).
      let settledGuild: string | null = null;
      if (b.owner) {
        // for no key update — 길드 해산(guilds KEY SHARE → 보스 FOR UPDATE)과 잠금 순서가 반대라 FOR UPDATE면 교착으로 한쪽이 중단된다(10-11 3차 감사).
        const [g] = (await tx.execute(sql`select id from guilds where id = ${b.owner}::bigint for no key update`)) as unknown as { id: string }[];
        if (g) {
          settledGuild = b.owner;
          await tx.execute(sql`
            update guilds set tax_pool_diamond = tax_pool_diamond + ${loot.diamond}::bigint,
                              tax_pool_boxes = tax_pool_boxes + ${loot.boxes}
             where id = ${b.owner}::bigint`);
          // 길드 활동 로그 — 전리품이 세금에 들어간 기록(10-11 3차 운영 감사: "세금에 안 들어왔어요" 대응 근거). 0페이즈도 남긴다(전리품 0).
          await logGuildAudit(tx, { serverId, guildId: BigInt(b.owner), actorUserId: null, action: 'world_boss_loot', detail: { bossId: b.id, zoneName: b.zone_name, bossName, stage: b.stage, diamond: loot.diamond, boxes: loot.boxes } });
          const body =
            `${b.zone_name}의 ${bossName}#{이} 최종 ${b.stage}페이즈에서 ${leave.pastPolite}. 길드 세금에 💎${loot.diamond.toLocaleString('ko-KR')}·📦${loot.boxes.toLocaleString('ko-KR')} 전리품이 쌓였어요.\n` +
            `길드 관리의 세금에서 확인할 수 있어요.`; // 우편은 길드원 전원에게 가므로 '나눌 수 있어요'는 권한 없는 사람에게 틀린 말(10-11 3차). '금고' 대신 '길드 세금'.
          // 0페이즈(전리품 0)면 우편은 보내지 않는다(10-11 재검사) — "💎0·📦0이 쌓였어요"는 빈 우편이다.
          if (b.stage > 0) await tx.execute(sql`
            insert into mailbox (user_id, server_id, type, title, body, sender_label, payload, expires_at)
            select gm.user_id, ${serverId}, 'world_boss'::mailbox_type, '월드보스 전리품', ${josa(body)}, '월드보스', '{}'::jsonb, now() + interval '30 days'
              from guild_members gm where gm.guild_id = ${b.owner}::bigint and gm.server_id = ${serverId}`);
        }
      }

      await tx.execute(sql`
        update world_bosses set status = 'left', settled_guild_id = ${settledGuild}::bigint, settled_at = now() where id = ${id}::bigint`);
      // 출발하지 않은 원정대 해산 — 참가자·신청도 지운다(싸운 기록은 departed 행에 남는다).
      const dis = (await tx.execute(sql`
        update world_boss_parties set status = 'disbanded', disband_reason = 'boss_left'
         where boss_id = ${id}::bigint and status = 'recruiting' returning id`)) as unknown as { id: string }[];
      if (dis.length > 0) {
        await tx.execute(sql`delete from world_boss_party_members m using world_boss_parties p where m.party_id = p.id and p.boss_id = ${id}::bigint and p.status = 'disbanded'`);
        await tx.execute(sql`delete from world_boss_join_requests r using world_boss_parties p where r.party_id = p.id and p.boss_id = ${id}::bigint and p.status = 'disbanded'`);
        await tx.execute(sql`delete from world_boss_invites i using world_boss_parties p where i.party_id = p.id and p.boss_id = ${id}::bigint and p.status = 'disbanded'`);
      }
      return { id, zoneId: b.zone_id, zoneName: b.zone_name, region: b.region, bossCode: b.boss_code, stage: Number(b.stage), lootDiamond: loot.diamond, lootBoxes: loot.boxes, guildId: settledGuild, guildName: settledGuild ? b.owner_name : null, disbanded: dis.length } satisfies SettledBoss;
  });
}
