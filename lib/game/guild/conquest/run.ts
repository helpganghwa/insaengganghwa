import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { zones, conquestBattles, guildMembers } from '@/lib/db/schema/guild';
import { mailbox } from '@/lib/db/schema/mailbox';
import { userEquipment } from '@/lib/db/schema/equipment';
import { characters } from '@/lib/db/schema/server';
import { combatPowerFromOwned, type OwnedRow } from '@/lib/game/equipment/combat-power';

import { conquestPowerMult } from '../balance';
import { simulateConquest, type ConquestUnit } from './simulate';

/**
 * 점령전 정산 — GUILD §5.8⑧. KST 23:00 cron. 그날(오늘 KST) 전투를 결정론 정산.
 *  - 경합 구역(공격 배치 ≥1)만 순회. 참가 = 배치(공/수) + 집행관(자동 ×3 방어).
 *  - effCp = 장비 전투력 스냅샷 × 역할 배수. simulateConquest → 승자 → 소유권/집행관 갱신.
 *  - 멱등: conquest_battles UNIQUE(zone_id, battle_kst_day) + 선조회. 구역별 트랜잭션.
 */
type DepRow = { zone_id: number; uid: string; guild_id: string; gname: string; role: 'attack' | 'defend' };
type ZoneRow = { id: number; name: string; owner_guild_id: string | null; executor: string | null; owner_name: string | null };

export async function runConquest(serverId: number): Promise<{ battleDay: string; resolved: number }> {
  const [todayRow] = (await db.execute(
    sql`select (now() at time zone 'Asia/Seoul')::date::text d`,
  )) as unknown as { d: string }[];
  const battleDay = todayRow!.d;

  // 그날 배치 전부(길드명 포함). guild_members 내부조인으로 **현재 소속이 배치 당시 길드와 일치하는**
  // 배치만 채택 — 배치 후 길드 이동/탈퇴/추방된 유저가 옛 길드 유닛으로 참전하는 것을 정산 시점에 차단
  // (이탈 시 clearConquestRoleOnExit가 선삭제하나, 정산 재검증은 방어선).
  const deps = (await db.execute(sql`
    select d.zone_id, d.user_id::text uid, d.guild_id::text guild_id, g.name gname, d.role::text role
    from guild_battle_deployments d
    join guilds g on g.id = d.guild_id
    join guild_members m
      on m.user_id = d.user_id and m.server_id = d.server_id and m.guild_id = d.guild_id
    where d.battle_kst_day = ${battleDay} and d.server_id = ${serverId}
  `)) as unknown as DepRow[];

  // 경합 구역 = 공격 배치가 있는 구역만.
  const contested = new Set<number>();
  for (const d of deps) if (d.role === 'attack') contested.add(d.zone_id);
  if (contested.size === 0) return { battleDay, resolved: 0 };
  const contestedArr = [...contested];

  // 경합 구역 정보(소유·집행관).
  // ⚠ Drizzle는 JS 배열 `${arr}`를 `($1,$2,…)` 튜플로 펼친다 — `= any(${arr})`는
  // `any(($1,$2,…))`가 되어 무효(any는 배열 인자). `in ${arr}` = `in ($1,$2,…)`로 써야 함.
  // (이 경로는 공격 배치가 있는 날만 실행돼 첫 경합일에야 노출된 잠복 버그였음.)
  const zoneRows = (await db.execute(sql`
    select z.id, z.name, z.owner_guild_id::text owner_guild_id, z.executor_user_id::text executor, og.name owner_name
    from zones z left join guilds og on og.id = z.owner_guild_id
    where z.id in ${contestedArr}
  `)) as unknown as ZoneRow[];
  const zoneInfo = new Map(zoneRows.map((z) => [z.id, z]));

  // 참가 유저(경합 구역 배치 + 집행관) → 장비/닉.
  const userIds = new Set<string>();
  for (const d of deps) if (contested.has(d.zone_id)) userIds.add(d.uid);
  for (const z of zoneRows) if (z.executor) userIds.add(z.executor);
  if (userIds.size === 0) return { battleDay, resolved: 0 };
  const idList = [...userIds];

  const eqRows = await db
    .select({
      uid: userEquipment.userId,
      cid: userEquipment.catalogItemId,
      el: userEquipment.enhanceLevel,
      tl: userEquipment.transcendLevel,
    })
    .from(userEquipment)
    .where(and(eq(userEquipment.serverId, serverId), inArray(userEquipment.userId, idList)));
  const ownedByUser = new Map<string, OwnedRow[]>();
  for (const r of eqRows) {
    const row: OwnedRow = { catalogItemId: r.cid, enhanceLevel: r.el, transcendLevel: r.tl };
    const arr = ownedByUser.get(r.uid);
    if (arr) arr.push(row);
    else ownedByUser.set(r.uid, [row]);
  }
  const cpOf = (uid: string): number => combatPowerFromOwned(ownedByUser.get(uid) ?? []);

  const nickRows = await db
    .select({ uid: characters.userId, nick: characters.nickname })
    .from(characters)
    .where(and(eq(characters.serverId, serverId), inArray(characters.userId, idList)));
  const nickOf = new Map(nickRows.map((r) => [r.uid, r.nick]));

  // 구역별 배치 묶기.
  const depsByZone = new Map<number, DepRow[]>();
  for (const d of deps) {
    if (!contested.has(d.zone_id)) continue;
    const arr = depsByZone.get(d.zone_id);
    if (arr) arr.push(d);
    else depsByZone.set(d.zone_id, [d]);
  }

  let resolved = 0;
  // 패배(소유권 이전) 누적 — 빼앗긴 길드별 구역명 목록. 정산 후 길드원 전체에 우편 1건.
  // 신규 정산(ins>0)일 때만 기록 → cron 다중 tick 멱등(이미 정산된 재실행은 우편 안 보냄).
  const losses = new Map<string, string[]>();
  for (const zoneId of contestedArr) {
    const z = zoneInfo.get(zoneId);
    if (!z) continue;
    const units: ConquestUnit[] = [];
    const seen = new Set<string>();
    for (const d of depsByZone.get(zoneId) ?? []) {
      seen.add(d.uid);
      units.push({
        userId: d.uid,
        nickname: nickOf.get(d.uid) ?? '플레이어',
        guildId: d.guild_id,
        guildName: d.gname,
        // 하한 1 — 장비 0개(CP 0) 유닛도 hp>0으로 정상 참전(0이면 hp 0 즉사·1뎀 기현상 방지).
        effCp: Math.max(1, Math.round(cpOf(d.uid) * conquestPowerMult(d.role, false))),
      });
    }
    // 집행관 자동 방어(×3) — 배치행 없이 포함(중복 방지).
    if (z.executor && z.owner_guild_id && !seen.has(z.executor)) {
      units.push({
        userId: z.executor,
        nickname: nickOf.get(z.executor) ?? '집행관',
        guildId: z.owner_guild_id,
        guildName: z.owner_name ?? '길드',
        effCp: Math.max(1, Math.round(cpOf(z.executor) * conquestPowerMult('defend', true))),
      });
    }

    const result = simulateConquest(units, `conquest:${battleDay}:${zoneId}`);
    const winner = result.winnerGuildId;

    const lostGuildId = await db.transaction(async (tx) => {
      const ins = await tx
        .insert(conquestBattles)
        .values({
          serverId,
          battleKstDay: battleDay,
          zoneId,
          winnerGuildId: winner ? BigInt(winner) : null,
          finale: result.finale,
        })
        .onConflictDoNothing({ target: [conquestBattles.zoneId, conquestBattles.battleKstDay] })
        .returning({ id: conquestBattles.id });
      if (ins.length === 0) return null; // 이미 정산(멱등) — 소유권도 손대지 않음

      // 승자 = 소유 길드 → 방어 성공(유지). 승자 = 공격/중립 점령 → 소유 이전 + 집행관 공석.
      let lost: string | null = null;
      if (winner && winner !== z.owner_guild_id) {
        await tx
          .update(zones)
          .set({ ownerGuildId: BigInt(winner), executorUserId: null, capturedAt: new Date() })
          .where(eq(zones.id, zoneId));
        if (z.owner_guild_id) lost = z.owner_guild_id; // 이전 소유 길드가 구역을 빼앗김
      }
      resolved++;
      return lost;
    });
    if (lostGuildId) {
      const arr = losses.get(lostGuildId) ?? [];
      arr.push(z.name);
      losses.set(lostGuildId, arr);
    }
  }

  // 패배 길드원 전체에 우편 1건(잃은 구역 전부 나열) — best-effort(정산과 분리, 실패해도 정산 유지).
  if (losses.size > 0) {
    const memberRows = await db
      .select({ uid: guildMembers.userId, guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(
        and(
          eq(guildMembers.serverId, serverId),
          inArray(guildMembers.guildId, [...losses.keys()].map(BigInt)),
        ),
      );
    const mails = memberRows
      .map((m) => {
        const zoneNames = losses.get(m.guildId.toString());
        if (!zoneNames || zoneNames.length === 0) return null;
        return {
          userId: m.uid,
          serverId,
          type: 'notice' as const,
          title: '점령전 패배',
          body: `점령전에서 ${zoneNames.length}개 구역을 잃었습니다: ${zoneNames.join(', ')}.`,
          senderLabel: '시스템',
          payload: {},
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
    if (mails.length > 0) await db.insert(mailbox).values(mails);
  }

  return { battleDay, resolved };
}
