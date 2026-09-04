import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { meleeBattles, meleeParticipants } from '@/lib/db/schema/melee';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { combatPowerFromOwned, type OwnedRow } from '@/lib/game/equipment/combat-power';
import { getGuildBriefsByUsers } from '@/lib/game/guild/badge';
import { meleeBonus, meleeRewardForRank, SUPPLY_SLOTS, type SupplySlot } from '@/lib/game/balance';

import { simulateMelee, type MeleeParticipantInput } from './simulate';

/**
 * 대난투 9시 산출 — MELEE §3. KST 오늘 배틀이 없으면:
 *  로스터(강화 1회+) 도출 → 전투력 9시 스냅샷 → 결정론 시뮬 → battle+participants 저장(status='computed').
 * 결과는 10:00 reveal 전까지 비공개. 멱등: battle_date UNIQUE + 선조회.
 *
 * 스케일: 로스터 CP 일괄(set-based) + 참가자 청크 insert. 초대규모는 청크/스트림/배치 큐 필요(MELEE §9).
 */

/** 보급 상자 count개를 3슬롯 균등 분배(무기/방어구/장신구 동일). 보상 개수는 3의 배수라
 *  정확히 count/3씩. 3의 배수가 아니면 나머지를 슬롯 순서대로 1개씩 얹음(결정론). */
function distributeBoxes(count: number): Record<SupplySlot, number> {
  const boxes: Record<SupplySlot, number> = { weapon: 0, armor: 0, accessory: 0 };
  if (count <= 0) return boxes;
  const base = Math.floor(count / SUPPLY_SLOTS.length);
  for (const s of SUPPLY_SLOTS) boxes[s] = base;
  let rem = count - base * SUPPLY_SLOTS.length;
  for (let i = 0; rem > 0; i++, rem--) boxes[SUPPLY_SLOTS[i % SUPPLY_SLOTS.length]!] += 1;
  return boxes;
}

export type RunMeleeOptions = {
  /**
   * 재실행(어드민 검수 창, 2026-09-03) — 오늘 배틀이 computed(발표 전)면 참가자·배틀 행을 지우고
   * 새 시드로 다시 돌린다. 시드에 salt를 붙여 결과가 달라지며, 실제 사용 시드는 seed 컬럼에 남는다(재현 가능).
   * 로스터·전투력은 재실행 시점으로 다시 집계된다(09:00 스냅샷이 아님).
   */
  rerun?: { seedSalt: string };
};

export type RunMeleeResult =
  | { ran: true; battleId: string; participants: number }
  | { ran: false; reason: 'EXISTS' | 'NOT_REPLACEABLE' | 'TOO_FEW' | 'RACE' };

export async function runMelee(serverId: number, opts: RunMeleeOptions = {}): Promise<RunMeleeResult> {
  const [today] = (await db.execute(
    sql`select (now() at time zone 'Asia/Seoul')::date::text d`,
  )) as unknown as { d: string }[];
  const battleDate = today!.d;
  // 결정론 시드 — serverId 포함(감사 B5): 날짜만이면 같은 날 두 서버가 동일 RNG 시퀀스를 공유해
  // 인덱스별 공격자선택·박스분배가 상관됨. `${serverId}:${battleDate}`로 서버 간 decorrelation.
  // 재실행은 salt를 덧붙여 다른 시퀀스를 만든다.
  const seed = opts.rerun ? `${serverId}:${battleDate}:${opts.rerun.seedSalt}` : `${serverId}:${battleDate}`;

  // 멱등 선조회 — 재실행은 반대로 '발표 전 배틀이 있어야' 진행한다.
  const [existing] = await db
    .select({ id: meleeBattles.id, status: meleeBattles.status })
    .from(meleeBattles)
    .where(and(eq(meleeBattles.serverId, serverId), eq(meleeBattles.battleDate, battleDate)))
    .limit(1);
  if (!opts.rerun) {
    if (existing) return { ran: false, reason: 'EXISTS' };
  } else if (!existing || existing.status !== 'computed') {
    return { ran: false, reason: 'NOT_REPLACEABLE' };
  }
  const replaceId = opts.rerun ? existing!.id : null;

  // 참가 자격: **전투력 > 0**(장비 보유로 CP가 잡히는 유저)이면 자동 참가. CP 0 = 미참가.
  //  정지 계정 제외 — 리더보드와 동일 정책(정지 중 자동 참가·보상 수령 차단).
  //  keyset 청크(감사 P1) — 서버 전 장비를 한 번에 메모리로 끌면 유저 수 비례 OOM.
  //  유저 id 순으로 잘라 배치당 장비만 적재, 누적은 {uid, cp}만.
  const BATCH = 2000;
  const withCp: { uid: string; cp: number }[] = [];
  let after = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const rows = (await db.execute(sql`
      select ei.user_id::text uid,
             json_agg(json_build_array(ei.catalog_item_id, ei.enhance_level, ei.transcend_level)) items
      from user_equipment ei
      join profiles p on p.id = ei.user_id
      where ei.server_id = ${serverId}
        and ei.user_id > ${after}::uuid
        and (p.banned_at is null or (p.ban_until is not null and p.ban_until <= now()))
      group by ei.user_id
      order by ei.user_id
      limit ${BATCH}
    `)) as unknown as { uid: string; items: [number, number, number][] }[];
    for (const r of rows) {
      const owned: OwnedRow[] = r.items.map(([cid, el, tl]) => ({
        catalogItemId: cid,
        enhanceLevel: el,
        transcendLevel: tl,
      }));
      const cp = combatPowerFromOwned(owned);
      if (cp > 0) withCp.push({ uid: r.uid, cp });
    }
    if (rows.length < BATCH) break;
    after = rows[rows.length - 1]!.uid;
  }
  // 2명 미만이면 불성립 — 혼자인 회차가 무전투 1위로 1위 보상 전액(1,000💎+상자 60)을
  // 가져가는 워크오버 차단(전수 감사 2026-08-21, 신서버 초기 실발현 경로).
  if (withCp.length < 2) return { ran: false, reason: 'TOO_FEW' };

  const ids = withCp.map((x) => x.uid);
  // 1000개씩 청크 — 전 참가자 대상 조회라 인원이 곧 파라미터 수다(Postgres 바인드 상한 65,535에서
  // 하드 실패, 그 전에도 만 단위부터 급격히 느려진다). 아래 아바타 조회·참가자 행 삽입과 동일 패턴.
  const nickOf = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 1000) {
    const rows = await db
      .select({ uid: characters.userId, nick: characters.nickname })
      .from(characters)
      .where(and(eq(characters.serverId, serverId), inArray(characters.userId, ids.slice(i, i + 1000))));
    for (const r of rows) nickOf.set(r.uid, r.nick);
  }

  const participants: MeleeParticipantInput[] = withCp.map((x) => ({
    userId: x.uid,
    nickname: nickOf.get(x.uid) ?? '플레이어',
    cp: x.cp,
  }));
  const cpOf = new Map(participants.map((p) => [p.userId, p.cp]));
  const n = participants.length;

  const result = simulateMelee(participants, seed);

  // 아바타 스냅샷 — finale 로스터 유저의 그 시점 활성 프로필 정면을 finale에 박제.
  //  과거 회차를 나중에 봐도 당시 아바타로 고정(닉·전투력·등수처럼). 로스터는 윈도 등장 유저만(유계).
  const rosterIds = result.finale.roster.map((r) => r.userId);
  if (rosterIds.length > 0) {
    const avRows = await db
      .select({
        uid: characters.userId,
        rotations: userProfiles.rotations,
      })
      .from(characters)
      .innerJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
      .where(and(eq(characters.serverId, serverId), inArray(characters.userId, rosterIds)));
    const avOf = new Map<string, string>();
    for (const a of avRows) {
      const rot = a.rotations as Record<string, string>;
      // 아바타는 항상 정면(south) — 8방향 미사용.
      const url = rot.south ?? Object.values(rot)[0];
      if (url) avOf.set(a.uid, url);
    }
    for (const r of result.finale.roster) r.avatar = avOf.get(r.userId) ?? null;

    // 길드 스냅샷 — 그 시점 소속 길드명·문장을 박제(우승 후 탈퇴·길드변경·문양변경에도 당시 길드로 표시).
    const guildBriefs = await getGuildBriefsByUsers(rosterIds, serverId).catch(
      () => new Map<string, { emblemUrl: string | null; name: string }>(),
    );
    for (const r of result.finale.roster) {
      const g = guildBriefs.get(r.userId);
      r.guildName = g?.name ?? null;
      r.guildEmblemUrl = g?.emblemUrl ?? null;
    }
  }

  // 길드 스냅샷(0138) — **전 참가자분**. finale.roster는 마지막 윈도 등장자만이라 순위표(하위권)엔
  // 부족하다. 현재 길드로 폴백하면 과거 회차가 오염되므로 회차 시점 값을 참가자 행에 박제한다.
  const guildAll = await getGuildBriefsByUsers(ids, serverId).catch(
    () => new Map<string, { emblemUrl: string | null; name: string }>(),
  );

  // 아바타·얼굴박스 스냅샷(0140) — 길드와 같은 이유로 **전 참가자분**. 순위표가 실시간 아바타를
  // 읽으면 아바타를 바꾼 유저의 과거 회차가 현재 모습으로 바뀐다(전투 재생은 스냅샷이라 어긋남).
  // rotations/options 통째로 받지 않고 필요한 두 값만 뽑는다(참가자 수천 명 규모).
  const avAll = new Map<string, { avatar: string | null; faceBox: unknown }>();
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const rows = await db
      .select({
        uid: characters.userId,
        avatar: sql<string | null>`${userProfiles.rotations} ->> 'south'`,
        faceBox: sql<unknown>`${userProfiles.options} -> 'faceBox'`,
      })
      .from(characters)
      .innerJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
      .where(and(eq(characters.serverId, serverId), inArray(characters.userId, chunk)))
      .catch(() => []);
    for (const r of rows) avAll.set(r.uid, { avatar: r.avatar, faceBox: r.faceBox ?? null });
  }

  // 배틀 행 + 참가자 행을 **단일 트랜잭션**으로(감사 B1). battle만 커밋되고 participants 적재 전
  // 중단되면, 멱등가드(선조회)가 0명 배틀을 영구화 → reveal의 insert…select가 0행 → 전원 보상
  // 우편 영구 유실. 두 적재를 원자화해 부분실패 시 롤백·재시도가 둘 다 재수행. race는 onConflict로 skip.
  const CHUNK = 1000;
  const out = await db.transaction(async (tx): Promise<RunMeleeResult> => {
    if (replaceId != null) {
      // 재실행 — 옛 배틀을 잠그고 아직 computed인지 재확인(발표 cron과의 경합: reveal이 먼저 잠갔으면
      // 여기서 대기했다가 revealed를 보고 롤백). 참가자 → 배틀 순으로 지우고 아래에서 새로 넣는다.
      const [locked] = await tx
        .select({ status: meleeBattles.status })
        .from(meleeBattles)
        .where(eq(meleeBattles.id, replaceId))
        .for('update');
      if (!locked || locked.status !== 'computed') throw new Error('MELEE_RERUN_RACE');
      await tx.delete(meleeParticipants).where(eq(meleeParticipants.battleId, replaceId));
      await tx.delete(meleeBattles).where(eq(meleeBattles.id, replaceId));
    }
    const inserted = await tx
      .insert(meleeBattles)
      .values({
        serverId,
        battleDate,
        seed,
        status: 'computed',
        participantCount: n,
        totalRounds: result.totalRounds,
        championUserId: result.championUserId || null,
        finale: result.finale,
        computedAt: new Date(),
      })
      .onConflictDoNothing({ target: [meleeBattles.serverId, meleeBattles.battleDate] })
      .returning({ id: meleeBattles.id });
    if (inserted.length === 0) return { ran: false, reason: 'RACE' };
    const battleId = inserted[0]!.id;

    // 공격 성공(킬) = 나를 killer로 기록한 참가자 수. 방어 성공 = 피격 − 탈락 피격(챔피언은 전부).
    const killsOf = new Map<string, number>();
    for (const r of result.ranks) if (r.killerUserId) killsOf.set(r.killerUserId, (killsOf.get(r.killerUserId) ?? 0) + 1);

    // 참가자 행 청크 insert (등수→보상 + 공격·방어 성공 보너스, 0192).
    const rows = result.ranks.map((r) => {
      const reward = meleeRewardForRank(r.finalRank, n);
      const defenseSuccess = Math.max(0, r.defenseCount - (r.killerUserId ? 1 : 0));
      const bonus = meleeBonus(killsOf.get(r.userId) ?? 0, defenseSuccess);
      return {
        battleId,
        userId: r.userId,
        cpSnapshot: BigInt(cpOf.get(r.userId) ?? 0),
        finalRank: r.finalRank,
        killerUserId: r.killerUserId,
        rewardDiamond: BigInt(reward.diamond + bonus.diamond),
        rewardBonusDiamond: bonus.diamond,
        rewardBonusBoxes: bonus.boxes,
        rewardBoxes: distributeBoxes(reward.boxes + bonus.boxes),
        myEvents: r.events,
        eliminatedRound: r.eliminatedRound,
        guildName: guildAll.get(r.userId)?.name ?? null,
        guildEmblemUrl: guildAll.get(r.userId)?.emblemUrl ?? null,
        nickname: nickOf.get(r.userId) ?? null,
        avatar: avAll.get(r.userId)?.avatar ?? null,
        faceBox: avAll.get(r.userId)?.faceBox ?? null,
        attackCount: r.attackCount,
        defenseCount: r.defenseCount,
      };
    });
    for (let i = 0; i < rows.length; i += CHUNK) {
      await tx.insert(meleeParticipants).values(rows.slice(i, i + CHUNK));
    }

    return { ran: true, battleId: battleId.toString(), participants: n };
  });

  return out;
}
