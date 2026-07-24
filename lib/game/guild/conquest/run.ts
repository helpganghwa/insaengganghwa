import 'server-only';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { zones, conquestBattles, guildMembers, guildAuditLog, guildBattleDeployments } from '@/lib/db/schema/guild';
import { worldEvents } from '@/lib/db/schema/world';
import { mailbox } from '@/lib/db/schema/mailbox';
import { userEquipment } from '@/lib/db/schema/equipment';
import { characters } from '@/lib/db/schema/server';
import { combatPowerFromOwned, type OwnedRow } from '@/lib/game/equipment/combat-power';

import { conquestPowerMult } from '../balance';
import { simulateConquest, type ConquestUnit } from './simulate';

/**
 * 점령전 정산 — GUILD §5.8⑧. **KST 23:00 cron**. 그날(오늘 KST) 전투를 결정론 정산.
 * 전투력 스냅샷·승자 산출은 23:00에 확정하되, **소유권 적용·우편은 하지 않는다**(지연 공개).
 * 결과는 conquest_battles에 published_at=NULL로 저장만 → 24:00 revealConquest가 공개·발표.
 * (대난투 computed→revealed 선례와 동형: 산출=정시, 노출=발표 시각.)
 *  - 경합 구역(공격 배치 ≥1)만 순회. 참가 = 배치(공/수) + 집행관(자동 ×2 방어).
 *  - effCp = 장비 전투력 스냅샷 × 역할 배수. simulateConquest → 승자 → finale 저장.
 *  - 멱등: conquest_battles UNIQUE(zone_id, battle_kst_day) + onConflictDoNothing.
 *  - battleDay는 호출자(cron 라우트)가 KST 오늘 날짜로 결정(클라 불신·결정론).
 */
type DepRow = { zone_id: number; uid: string; guild_id: string; gname: string; role: 'attack' | 'defend' };
type ZoneRow = { id: number; name: string; owner_guild_id: string | null; executor: string | null; owner_name: string | null };

export async function runConquest(serverId: number, battleDay: string): Promise<{ battleDay: string; resolved: number }> {
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
    // 집행관 자동 방어(×2) — 배치행 없이 포함(중복 방지).
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

    // 결과 저장만(published_at=NULL) — 소유권/우편은 24:00 revealConquest로 지연.
    const ins = await db
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
    if (ins.length > 0) resolved++;
  }

  return { battleDay, resolved };
}

/**
 * 점령전 공개 — GUILD §5.8⑨. **KST 자정(00시대) cron**. 23:00에 저장된(미공개) 그 전투일 결과를
 * 한꺼번에 노출·발표한다: 소유권/집행관 적용 + 관여 길드원 결과 우편 + published_at 마킹.
 * 전투 기록 조회(getZone…/getConquestBattleById)는 published_at not-null만 보이므로, 공개 전엔 비노출.
 *  - published_at IS NULL 행만 처리 → 멱등(다중 tick·동시 cron 안전). 조건부 플립으로 우편 1회 보장.
 *  - prevOwner = 공개 직전 zones 소유(아직 미변경). 분류(점령/방어/상실/공격실패)는 정산 당시와 동일.
 *  - battleDay = KST 어제(전투일). chronicle cron이 narrate 직전 호출.
 */
/**
 * 방치 구역 중립화(B안 — 고착 개선). 그 점령전(battleDay)에 **공격·수비 배치가 하나도 없고
 * 집행관도 없는**(완전 방치) 소유 지역을 중립으로 되돌린다 → 다음 점령전부터 자유공격 개방.
 *  - 수비0+공격O = 무혈 점령(전투로 처리) / 수비O(배치·집행관 자동방어) = 소유 유지 → 이 둘은 제외.
 *  - 세금(tax_diamond/points)은 유지(다음 점령자에게 약탈 이전), 소유·집행관·captured_at만 해제.
 *  - 공개(소유권 플립) 직후 호출 — 뺏긴 구역은 공격 배치가 있어 대상 아님.
 */
export async function neutralizeAbandonedZones(
  serverId: number,
  battleDay: string,
): Promise<{ neutralized: number }> {
  return db.transaction(async (tx) => {
    // 방치 구역(소유·집행관0·공격수비배치0) + 이전 소유 길드/구역명을 중립화 **전에** 캡처.
    const victims = (await tx.execute(sql`
      select z.id, z.owner_guild_id::text as owner, z.name, g.name as gname
      from zones z join guilds g on g.id = z.owner_guild_id
      where z.server_id = ${serverId}
        and z.owner_guild_id is not null
        and z.executor_user_id is null
        and z.id not in (
          select zone_id from guild_battle_deployments
          where server_id = ${serverId} and battle_kst_day = ${battleDay}
        )
    `)) as unknown as { id: number; owner: string; name: string; gname: string }[];
    if (victims.length === 0) return { neutralized: 0 };
    await tx
      .update(zones)
      .set({ ownerGuildId: null, executorUserId: null, capturedAt: null })
      .where(inArray(zones.id, victims.map((v) => v.id)));
    // 역사 재료 — 이전 소유 길드별 상실 구역을 world_event로 기록(연대기 전용, 월드 피드 제외 타입).
    // zones는 이미 null이라 이 스냅샷이 '누가 무엇을 방치로 잃었나'의 유일한 소스(chronicle이 읽음).
    const byGuild = new Map<string, { gname: string; zones: string[] }>();
    for (const v of victims) {
      const e = byGuild.get(v.owner) ?? { gname: v.gname, zones: [] };
      e.zones.push(v.name);
      byGuild.set(v.owner, e);
    }
    for (const [owner, e] of byGuild) {
      await tx.insert(worldEvents).values({
        serverId,
        type: 'zone_neutralized',
        guildId: BigInt(owner),
        // battleDay를 detail에 담는다 — 이 이벤트는 정산(D+1 00시)에 생성돼 created_at 날짜가
        // 전투일(D)과 어긋난다. 연대기 집계는 created_at이 아니라 이 battleDay로 매칭한다.
        detail: { guildName: e.gname, zones: e.zones, battleDay },
      });
    }
    return { neutralized: victims.length };
  });
}

/**
 * 점령전 공개 직후(자정) 수비 배치 이월 — GUILD §5.8. 어제(battleDay) 수비 배치 중
 * **여전히 길드가 소유한 구역 + 아직 그 길드 소속**인 유저만 다음 전투일로 재생성(role=defend).
 * 공격 배치는 이월 안 함(전원 자동 해제). 집행관은 zones.executor로 유지(자동 ×2 방어).
 * 재실행 안전 — carryDay에 배치가 이미 있으면(이월 완료 or 유저가 이미 배치 시작) 건너뜀.
 */
export async function carryOverDefenders(
  serverId: number,
  battleDay: string,
): Promise<{ carried: number }> {
  const d = new Date(`${battleDay}T12:00:00Z`); // 정오 기준 날짜 산술(DST 무관)
  d.setUTCDate(d.getUTCDate() + 1);
  const carryDay = d.toISOString().slice(0, 10);

  // 길드별 멱등 — 그 길드가 carryDay에 이미 배치가 있으면(이월 완료 or 유저가 이미 배치 시작)
  // 그 길드는 건너뜀(재실행 안전 + 유저 변경 비복원 + 길드 간 간섭 없음).
  const rows = (await db.execute(sql`
    select d.user_id::text user_id, d.guild_id::text guild_id, d.zone_id zone_id
    from guild_battle_deployments d
    join zones z on z.id = d.zone_id and z.owner_guild_id = d.guild_id
    join guild_members gm on gm.user_id = d.user_id and gm.server_id = d.server_id and gm.guild_id = d.guild_id
    where d.server_id = ${serverId} and d.battle_kst_day = ${battleDay} and d.role = 'defend'
      and not exists (
        select 1 from guild_battle_deployments x
        where x.server_id = ${serverId} and x.battle_kst_day = ${carryDay} and x.guild_id = d.guild_id
      )
  `)) as unknown as { user_id: string; guild_id: string; zone_id: number }[];
  if (rows.length === 0) return { carried: 0 };

  await db
    .insert(guildBattleDeployments)
    .values(
      rows.map((r) => ({
        userId: r.user_id,
        serverId,
        guildId: BigInt(r.guild_id),
        zoneId: r.zone_id,
        role: 'defend' as const,
        battleKstDay: carryDay,
      })),
    )
    .onConflictDoNothing();
  return { carried: rows.length };
}

type RevealRow = { id: string; zid: number; zname: string; winner: string | null; prev: string | null };

export async function revealConquest(serverId: number, battleDay: string): Promise<{ revealed: number; mailed: number }> {
  // 미공개 전투 + 구역명·현재 소유(공개 직전).
  const rows = (await db.execute(sql`
    select cb.id::text id, cb.zone_id zid, z.name zname,
           cb.winner_guild_id::text winner, z.owner_guild_id::text prev
    from conquest_battles cb
    join zones z on z.id = cb.zone_id
    where cb.server_id = ${serverId} and cb.battle_kst_day = ${battleDay} and cb.published_at is null
    order by cb.id
  `)) as unknown as RevealRow[];
  if (rows.length === 0) return { revealed: 0, mailed: 0 };

  // 그날 공격 배치(우편 분류용) — 구역별 공격 길드.
  const deps = (await db.execute(sql`
    select d.zone_id zid, d.guild_id::text guild_id, d.role::text role
    from guild_battle_deployments d
    where d.battle_kst_day = ${battleDay} and d.server_id = ${serverId}
  `)) as unknown as { zid: number; guild_id: string; role: string }[];
  const deployGuildsByZone = new Map<number, Set<string>>();
  const attackersByZone = new Map<number, Set<string>>();
  for (const d of deps) {
    (deployGuildsByZone.get(d.zid) ?? deployGuildsByZone.set(d.zid, new Set()).get(d.zid)!).add(d.guild_id);
    if (d.role === 'attack')
      (attackersByZone.get(d.zid) ?? attackersByZone.set(d.zid, new Set()).get(d.zid)!).add(d.guild_id);
  }

  type GuildResult = { captured: string[]; defended: string[]; lost: string[]; failed: string[] };
  const results = new Map<string, GuildResult>();
  const bucketOf = (gid: string): GuildResult => {
    let r = results.get(gid);
    if (!r) {
      r = { captured: [], defended: [], lost: [], failed: [] };
      results.set(gid, r);
    }
    return r;
  };

  // 전체 reveal 원자화(감사 #1) — 플립+소유이전+요약우편을 단일 tx로. 중간 크래시 시 전부 롤백되어
  // 다음 tick이 재수행(우편 유실 방지, revealMelee와 동일). 동시 cron은 조건부 플립(published_at IS
  // NULL)+행잠금으로 1회만 적용(rows를 cb.id 순으로 잠가 데드락 회피). 감사로그는 tx 밖 best-effort.
  const out = await db.transaction(async (tx) => {
  let revealed = 0;
  for (const r of rows) {
    // 조건부 플립(published_at IS NULL → now()) — 동시 cron/다중 tick에서 1회만 적용.
    const flip = await tx
      .update(conquestBattles)
      .set({ publishedAt: new Date() })
      .where(and(eq(conquestBattles.id, BigInt(r.id)), isNull(conquestBattles.publishedAt)))
      .returning({ id: conquestBattles.id });
    if (flip.length === 0) continue; // 다른 실행이 이미 공개
    // 승자 = 공격/중립 점령 → 소유 이전 + 집행관 공석 + 수금 타이머 리셋(B안 — 뺏은 길드도 습득 72h 뒤 수금).
    if (r.winner && r.winner !== r.prev) {
      await tx
        .update(zones)
        .set({ ownerGuildId: BigInt(r.winner), executorUserId: null, capturedAt: new Date(), lastTaxCollectedAt: null })
        .where(eq(zones.id, r.zid));
    }
    revealed++;

    // 결과 분류 — 관여 길드(승자·이전 소유·배치 길드)별 이 구역 결과 귀속(요약 우편용).
    const involved = new Set<string>();
    if (r.winner) involved.add(r.winner);
    if (r.prev) involved.add(r.prev);
    for (const g of deployGuildsByZone.get(r.zid) ?? []) involved.add(g);
    const attackers = attackersByZone.get(r.zid) ?? new Set<string>();
    for (const g of involved) {
      const b = bucketOf(g);
      if (r.winner && g === r.winner && g === r.prev) b.defended.push(r.zname); // 방어 성공(소유 유지)
      else if (r.winner && g === r.winner) b.captured.push(r.zname); // 점령(탈취/중립 확보)
      else if (r.winner && g === r.prev) b.lost.push(r.zname); // 상실(빼앗김)
      else if (!r.winner && g === r.prev) b.defended.push(r.zname); // 무승부 = 소유 유지
      else if (attackers.has(g)) b.failed.push(r.zname); // 공격 실패
    }
  }

  // 요약 우편(관여 길드원) — 플립과 동일 tx로 원자 적재(감사 #1). 크래시 시 플립과 함께 롤백→다음 tick 재수행.
  let mailed = 0;
  if (results.size > 0) {
    const fmtBody = (r: GuildResult): string => {
      const lines: string[] = [];
      if (r.captured.length) lines.push(`🚩 점령: ${r.captured.join(', ')}`);
      if (r.defended.length) lines.push(`🛡️ 방어 성공: ${r.defended.join(', ')}`);
      if (r.lost.length) lines.push(`💥 상실: ${r.lost.join(', ')}`);
      if (r.failed.length) lines.push(`⚔️ 공격 실패: ${r.failed.join(', ')}`);
      return lines.join('\n');
    };
    const memberRows = await tx
      .select({ uid: guildMembers.userId, guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(
        and(
          eq(guildMembers.serverId, serverId),
          inArray(guildMembers.guildId, [...results.keys()].map(BigInt)),
        ),
      );
    const mails = memberRows
      .map((m) => {
        const r = results.get(m.guildId.toString());
        if (!r) return null;
        const body = fmtBody(r);
        if (!body) return null;
        return {
          userId: m.uid,
          serverId,
          type: 'conquest' as const,
          title: '점령전 결과',
          body,
          senderLabel: '시스템',
          payload: {},
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
    if (mails.length > 0) {
      await tx.insert(mailbox).values(mails);
      mailed = mails.length;
    }
  }
  return { revealed, mailed };
  });

  // 길드 활동 로그 — 점령/상실만(시스템 액션). best-effort(우편·공개와 분리, 실패해도 무시), tx 밖.
  const auditRows = [...results.entries()].flatMap(([gid, r]) => [
    ...r.captured.map((zone) => ({
      serverId,
      guildId: BigInt(gid),
      actorUserId: null,
      action: 'zone_capture' as const,
      detail: { zone },
    })),
    ...r.lost.map((zone) => ({
      serverId,
      guildId: BigInt(gid),
      actorUserId: null,
      action: 'zone_lost' as const,
      detail: { zone },
    })),
  ]);
  if (auditRows.length > 0) {
    try {
      await db.insert(guildAuditLog).values(auditRows);
    } catch {
      // 로그 기록 실패는 정산/우편에 영향 없음.
    }
  }

  return out;
}
