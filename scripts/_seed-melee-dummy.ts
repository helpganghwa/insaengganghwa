/**
 * 일관성 있는 대난투 더미 배틀 생성(테스트용) — 실제 simulateMelee로 생성.
 *  - 참가자: 실유저 2명(RYU·YOONEE, 압도적 CP) + 합성 58명(finale 표시 전용).
 *  - finale(roster·events)는 시뮬 결과 그대로 drizzle jsonb 저장 → 체인/HP/데미지/생존자 전부 정합.
 *  - melee_participants는 FK(profiles) 때문에 실유저 2명만 삽입(시상대·내순위·내전투).
 *  - 실유저가 1·2위가 되도록 시드를 돌려가며 보장(챔피언 FK + 시상대 채움).
 * 일회성: bun run scripts/_seed-melee-dummy.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from '../lib/db/schema';
import { meleeBattles, meleeParticipants } from '../lib/db/schema/melee';
import { simulateMelee, type MeleeParticipantInput } from '../lib/game/melee/simulate';
import { meleeRewardForRank } from '../lib/game/balance';

const client = postgres(process.env.DIRECT_URL!, { max: 1, prepare: false, idle_timeout: 5 });
const db = drizzle(client, { schema });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REAL = [
  { userId: 'b8f0bb7e-6a1a-4853-b366-72bee74ae8d1', nickname: 'RYU', cp: 62000 },
  { userId: '558929d2-9669-43da-926d-c26ac138a430', nickname: 'YOONEE', cp: 60000 },
];

function splitBoxes(count: number): { weapon: number; armor: number; accessory: number } {
  const b = { weapon: 0, armor: 0, accessory: 0 };
  const slots = ['weapon', 'armor', 'accessory'] as const;
  for (let i = 0; i < count; i++) b[slots[i % 3]!]++;
  return b;
}

async function main() {
  const battleDate = '2026-06-02'; // 오늘 KST

  // 합성 참가자 58명(작은 CP) — finale 표시 전용 가짜 id.
  const synth: MeleeParticipantInput[] = Array.from({ length: 58 }, (_, i) => ({
    userId: `sim-${String(i + 1).padStart(3, '0')}`,
    nickname: `검투사 ${i + 1}`,
    cp: 8000 + Math.round(((i * 9301 + 49297) % 233280) / 233280 * 32000), // 8k~40k 결정적 분산
  }));
  const participants: MeleeParticipantInput[] = [...REAL, ...synth];
  const n = participants.length;

  // 실유저 2명이 1·2위가 되는 시드 탐색.
  let result = simulateMelee(participants, `${battleDate}-v0`);
  let chosen = '';
  for (let k = 0; k < 200; k++) {
    const seed = `${battleDate}-v${k}`;
    const r = simulateMelee(participants, seed);
    const ranks = new Map(r.ranks.map((x) => [x.userId, x.finalRank]));
    const r1 = ranks.get(REAL[0]!.userId)!;
    const r2 = ranks.get(REAL[1]!.userId)!;
    if (new Set([r1, r2]).size === 2 && Math.max(r1, r2) <= 2) {
      result = r;
      chosen = seed;
      break;
    }
  }
  if (!chosen) {
    console.error('실유저 1·2위 시드 못 찾음 — CP 격차를 더 벌리세요.');
    process.exit(1);
  }
  console.log(`[seed] ${chosen} · totalRounds=${result.totalRounds} · champion=${result.championUserId}`);

  // 기존 배틀(깨진 더미) 제거.
  const existing = await db
    .select({ id: meleeBattles.id })
    .from(meleeBattles)
    .where(eq(meleeBattles.battleDate, battleDate));
  for (const b of existing) {
    await db.delete(meleeParticipants).where(eq(meleeParticipants.battleId, b.id));
    await db.delete(meleeBattles).where(eq(meleeBattles.id, b.id));
  }

  // 배틀 insert(drizzle → finale 올바른 jsonb object).
  const [battle] = await db
    .insert(meleeBattles)
    .values({
      battleDate,
      seed: chosen,
      status: 'revealed',
      participantCount: n,
      totalRounds: result.totalRounds,
      championUserId: result.championUserId,
      finale: result.finale,
      computedAt: new Date(),
      revealedAt: new Date(),
    })
    .returning({ id: meleeBattles.id });
  const battleId = battle!.id;

  // 실유저 2명만 participants 삽입(FK).
  const cpOf = new Map(participants.map((p) => [p.userId, p.cp]));
  for (const real of REAL) {
    const rk = result.ranks.find((x) => x.userId === real.userId)!;
    const reward = meleeRewardForRank(rk.finalRank, n);
    const killer = rk.killerUserId && UUID_RE.test(rk.killerUserId) ? rk.killerUserId : null;
    await db.insert(meleeParticipants).values({
      battleId,
      userId: real.userId,
      cpSnapshot: BigInt(cpOf.get(real.userId) ?? 0),
      finalRank: rk.finalRank,
      killerUserId: killer,
      rewardDiamond: BigInt(reward.diamond),
      rewardBoxes: splitBoxes(reward.boxes),
      myEvents: rk.events,
      attackCount: rk.attackCount,
      defenseCount: rk.defenseCount,
    });
    console.log(`  participant ${real.nickname}: rank=${rk.finalRank} dia=${reward.diamond} box=${reward.boxes} events=${rk.events.length}`);
  }

  console.log(`[done] battle #${battleId} (${battleDate}) revealed. roster=${result.finale.roster.length} events=${result.finale.events.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
