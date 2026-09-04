import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { walletTrySpend } from '@/lib/game/wallet';
import { raids, raidParticipants, raidDailyCounts } from '@/lib/db/schema/raid';
import {
  RAID_DAILY_CAP,
  RAID_MAX_CONCURRENT_PER_USER,
  RAID_PHASE1_HP_MAX,
  RAID_PHASE1_HP_MIN,
  RAID_TIERS,
  RAID_WINDOW_MS,
  RAID_DURATION_OPTIONS_MS,
  raidTierOf,
  type RaidTier,
} from '@/lib/game/balance';
import { kstDateString } from '@/lib/kst';
import type { RaidBoss } from './bosses';

export type { RaidBoss };

/** 레이드 — GDD §3.5 / BALANCE §5 / SCHEMA §6. */
export type RaidErrorCode =
  | 'INSUFFICIENT_DIAMOND'
  | 'DAILY_CAP_REACHED'
  | 'CONCURRENT_LIMIT'
  | 'RAID_NOT_FOUND'
  | 'RAID_CLOSED'
  | 'RAID_FULL'
  | 'ALREADY_JOINED'
  | 'NO_CHARACTER_ON_SERVER' // 크로스서버 참가 차단(풀 아이솔레이션 — 감사 R4)
  | 'INVALID_TARGET' // 초대 대상이 친구·길드원이 아님(또는 자기 자신, 0146)
  | 'NOT_PARTICIPANT'
  | 'NO_ATTACKS'
  | 'NOT_SETTLEABLE'
  | 'REWARD_ALREADY_CLAIMED'
  | 'NOT_HOST'
  | 'REQUEST_NOT_FOUND'
  | 'NOT_SHARED';

export class RaidError extends Error {
  constructor(public code: RaidErrorCode) {
    super(code);
    this.name = 'RaidError';
  }
}


function rngU32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}
function genShareCode(): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += (rngU32() % 36).toString(36);
  return s;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 동시 진행(active, 호스팅+참여 합산) — host도 participant로 등록되므로 한 쿼리. */
export async function activeRaidCount(tx: Tx, userId: string) {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(raidParticipants)
    .innerJoin(raids, eq(raids.id, raidParticipants.raidId))
    .where(and(eq(raidParticipants.userId, userId), eq(raids.status, 'active')));
  return n;
}

/** 일일 한도(KST) 체크 + 증가 (open/join 공통, 호스팅+참여 합산). */
export async function bumpDailyOrThrow(tx: Tx, userId: string, serverId: number) {
  const kstDate = kstDateString();
  // 행 존재 보장 — 그날 첫 행이 없으면 FOR UPDATE가 잠글 대상이 없어(부재 행 갭 락 없음)
  // 동시 N요청이 모두 c=0으로 캡 체크를 통과한다. 선행 upsert로 항상 잠금이 성립하게.
  await tx
    .insert(raidDailyCounts)
    .values({ userId, serverId, kstDate, startedCount: 0 })
    .onConflictDoNothing();
  const [row] = await tx
    .select({ c: raidDailyCounts.startedCount })
    .from(raidDailyCounts)
    .where(
      and(
        eq(raidDailyCounts.userId, userId),
        eq(raidDailyCounts.serverId, serverId),
        eq(raidDailyCounts.kstDate, kstDate),
      ),
    )
    .for('update');
  if ((row?.c ?? 0) >= RAID_DAILY_CAP) throw new RaidError('DAILY_CAP_REACHED');
  await tx
    .update(raidDailyCounts)
    .set({ startedCount: sql`${raidDailyCounts.startedCount} + 1` })
    .where(
      and(
        eq(raidDailyCounts.userId, userId),
        eq(raidDailyCounts.serverId, serverId),
        eq(raidDailyCounts.kstDate, kstDate),
      ),
    );
}

export type RaidShareMode = 'off' | 'free' | 'approval';

export function openRaid(input: {
  userId: string;
  serverId: number;
  bossCode: RaidBoss;
  friendShare?: RaidShareMode;
  guildShare?: RaidShareMode;
  /** 공격창 길이(ms) — 개설자가 선택(1/3/6시간). 목록 밖 값은 기본 6시간으로 강제. */
  durationMs?: number;
  /** 난이도(BALANCE §5.4) — 개설비·HP 배수·상자·마일스톤. 알 수 없는 값은 쉬움. */
  tier?: RaidTier;
}): Promise<{ raidId: bigint; shareCode: string }> {
  const { userId, bossCode, friendShare = 'off', guildShare = 'off' } = input;
  // 서버 권위 — 난이도도 허용 목록만(클라 문자열 신뢰 X).
  const tier = raidTierOf(input.tier);
  const rule = RAID_TIERS[tier];
  // 서버 권위 — 클라가 보낸 지속시간은 허용 목록(1/3/6h)만 신뢰, 그 외는 기본값.
  const durationMs = (RAID_DURATION_OPTIONS_MS as readonly number[]).includes(input.durationMs ?? -1)
    ? input.durationMs!
    : RAID_WINDOW_MS;

  return db.transaction(async (tx) => {
    // ⚠ 순서 주의 — 동시 상한 검사는 반드시 bumpDailyOrThrow **뒤에** 온다(2026-08-11).
    // activeRaidCount는 잠금 없는 count라 앞에 두면 동시 요청이 전부 같은 값을 읽고 통과한다
    // (일일 상한은 그 갭 락 문제를 선행 upsert로 이미 막아뒀는데 이쪽만 남아 있었다).
    // bumpDailyOrThrow가 유저별 행을 FOR UPDATE로 잠그므로, 그 뒤에서 세면 락 대기 후
    // 커밋된 값을 본다(READ COMMITTED). 검사 실패 시 증가분은 같은 트랜잭션이라 롤백된다.
    // 잔여 — activeRaidCount는 서버 무관 전수인데 일일 행은 서버별이라, 서로 다른 서버로
    // 동시 요청하면 직렬화되지 않는다(현재 1서버라 미발현).
    await bumpDailyOrThrow(tx, userId, input.serverId);
    if ((await activeRaidCount(tx, userId)) >= RAID_MAX_CONCURRENT_PER_USER) {
      throw new RaidError('CONCURRENT_LIMIT');
    }

    // 개설비 차감(난이도별) — 서버별 지갑 조건부 UPDATE(부족 시 미차감).
    const paid = await walletTrySpend(tx, userId, input.serverId, rule.openCost, 'raid_open');
    if (!paid) throw new RaidError('INSUFFICIENT_DIAMOND');

    // 난이도 HP 배수는 여기서 한 번만 곱해 저장 — 이후 페이즈 수식·돌파 판정·게이지는 난이도 무관.
    const phase1Hp =
      (RAID_PHASE1_HP_MIN + (rngU32() % (RAID_PHASE1_HP_MAX - RAID_PHASE1_HP_MIN + 1))) *
      rule.hpMult;
    const now = Date.now();
    const [raid] = await tx
      .insert(raids)
      .values({
        serverId: input.serverId,
        hostUserId: userId,
        bossCode,
        phase1Hp: BigInt(phase1Hp),
        shareCode: genShareCode(),
        expireAt: new Date(now + durationMs),
        status: 'active',
        friendShare,
        guildShare,
        tier,
      })
      .returning({ id: raids.id, shareCode: raids.shareCode });

    await tx.insert(raidParticipants).values({ raidId: raid!.id, userId });

    return { raidId: raid!.id, shareCode: raid!.shareCode };
  });
}
