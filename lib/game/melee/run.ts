import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { meleeBattles, meleeParticipants } from '@/lib/db/schema/melee';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { combatPowerFromOwned, type OwnedRow } from '@/lib/game/equipment/combat-power';
import { getGuildBriefsByUsers } from '@/lib/game/guild/badge';
import { meleeRewardForRank, SUPPLY_SLOTS, type SupplySlot } from '@/lib/game/balance';

import { simulateMelee, type MeleeParticipantInput } from './simulate';
import { makeRng } from './rng';

/**
 * 대난투 9시 산출 — MELEE §3. KST 오늘 배틀이 없으면:
 *  로스터(강화 1회+) 도출 → 전투력 9시 스냅샷 → 결정론 시뮬 → battle+participants 저장(status='computed').
 * 결과는 10:00 reveal 전까지 비공개. 멱등: battle_date UNIQUE + 선조회.
 *
 * 스케일: 로스터 CP 일괄(set-based) + 참가자 청크 insert. 초대규모는 청크/스트림/배치 큐 필요(MELEE §9).
 */
type EqRow = { uid: string; cid: number; el: number; tl: number };

/** 보급 상자 count개를 슬롯에 결정론 분배(seed+userId). */
function distributeBoxes(count: number, seed: string, userId: string): Record<SupplySlot, number> {
  const boxes: Record<SupplySlot, number> = { weapon: 0, armor: 0, accessory: 0 };
  if (count <= 0) return boxes;
  const rng = makeRng(`${seed}:${userId}:box`);
  for (let i = 0; i < count; i++) {
    boxes[SUPPLY_SLOTS[Math.floor(rng() * SUPPLY_SLOTS.length)]!] += 1;
  }
  return boxes;
}

export async function runMelee(serverId: number): Promise<{ ran: boolean; battleId?: string; participants?: number }> {
  const [today] = (await db.execute(
    sql`select (now() at time zone 'Asia/Seoul')::date::text d`,
  )) as unknown as { d: string }[];
  const battleDate = today!.d;
  // 결정론 시드 — serverId 포함(감사 B5): 날짜만이면 같은 날 두 서버가 동일 RNG 시퀀스를 공유해
  // 인덱스별 공격자선택·박스분배가 상관됨. `${serverId}:${battleDate}`로 서버 간 decorrelation.
  const seed = `${serverId}:${battleDate}`;

  // 멱등 선조회
  const [existing] = await db
    .select({ id: meleeBattles.id })
    .from(meleeBattles)
    .where(and(eq(meleeBattles.serverId, serverId), eq(meleeBattles.battleDate, battleDate)))
    .limit(1);
  if (existing) return { ran: false };

  // 참가 자격: **전투력 > 0**(장비 보유로 CP가 잡히는 유저)이면 자동 참가. CP 0 = 미참가.
  //  전 유저 장비 일괄 로드 → JS에서 유저별 CP 산출 → 0 초과만 로스터.
  const eqRows = (await db.execute(sql`
    select ei.user_id::text uid, ei.catalog_item_id cid, ei.enhance_level el, ei.transcend_level tl
    from user_equipment ei
    where ei.server_id = ${serverId}
  `)) as unknown as EqRow[];
  if (eqRows.length === 0) return { ran: false };

  const byUser = new Map<string, OwnedRow[]>();
  for (const r of eqRows) {
    const row: OwnedRow = { catalogItemId: r.cid, enhanceLevel: r.el, transcendLevel: r.tl };
    const arr = byUser.get(r.uid);
    if (arr) arr.push(row);
    else byUser.set(r.uid, [row]);
  }

  // 유저별 CP 산출 후 CP > 0 만 참가자로.
  const withCp = [...byUser.entries()]
    .map(([uid, owned]) => ({ uid, cp: combatPowerFromOwned(owned) }))
    .filter((x) => x.cp > 0);
  if (withCp.length === 0) return { ran: false };

  const ids = withCp.map((x) => x.uid);
  const nickRows = await db
    .select({ uid: characters.userId, nick: characters.nickname })
    .from(characters)
    .where(and(eq(characters.serverId, serverId), inArray(characters.userId, ids)));
  const nickOf = new Map(nickRows.map((r) => [r.uid, r.nick]));

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
        dir: userProfiles.activeDirection,
      })
      .from(characters)
      .innerJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
      .where(and(eq(characters.serverId, serverId), inArray(characters.userId, rosterIds)));
    const avOf = new Map<string, string>();
    for (const a of avRows) {
      const rot = a.rotations as Record<string, string>;
      // 유저가 설정한 방향(activeDirection) 우선 — 없으면 south 폴백.
      const url = (a.dir ? rot[a.dir] : undefined) ?? rot.south;
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

  // 배틀 행 + 참가자 행을 **단일 트랜잭션**으로(감사 B1). battle만 커밋되고 participants 적재 전
  // 중단되면, 멱등가드(선조회)가 0명 배틀을 영구화 → reveal의 insert…select가 0행 → 전원 보상
  // 우편 영구 유실. 두 적재를 원자화해 부분실패 시 롤백·재시도가 둘 다 재수행. race는 onConflict로 skip.
  const CHUNK = 1000;
  const out = await db.transaction(async (tx) => {
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
    if (inserted.length === 0) return { ran: false as const };
    const battleId = inserted[0]!.id;

    // 참가자 행 청크 insert (등수→보상).
    const rows = result.ranks.map((r) => {
      const reward = meleeRewardForRank(r.finalRank, n);
      return {
        battleId,
        userId: r.userId,
        cpSnapshot: BigInt(cpOf.get(r.userId) ?? 0),
        finalRank: r.finalRank,
        killerUserId: r.killerUserId,
        rewardDiamond: BigInt(reward.diamond),
        rewardBoxes: distributeBoxes(reward.boxes, seed, r.userId),
        myEvents: r.events,
        attackCount: r.attackCount,
        defenseCount: r.defenseCount,
      };
    });
    for (let i = 0; i < rows.length; i += CHUNK) {
      await tx.insert(meleeParticipants).values(rows.slice(i, i + CHUNK));
    }

    return { ran: true as const, battleId: battleId.toString(), participants: n };
  });

  return out;
}
