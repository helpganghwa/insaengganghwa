/**
 * 테스트용 완료(settled) 레이드 2개 생성 — 결산 보상 수령 UI 확인용.
 * 대상 유저를 호스트+참여자로 넣고, settle.ts 로직을 인라인 재현(상자 보상, 미수령).
 *
 * 실행: bun run scripts/_seed-test-raids.ts <userId>
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from '../lib/db/schema/raid';
import { profiles } from '../lib/db/schema/profiles';
import { raidPhasesCleared, aggregatePhaseDrops } from '../lib/game/raid/drops';

const userId = process.argv[2];
if (!userId) {
  console.error('usage: bun run scripts/_seed-test-raids.ts <userId>');
  process.exit(1);
}

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL 또는 DIRECT_URL 필요 — .env.local 확인');
  process.exit(1);
}
const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client, { schema: { ...schema, profiles } });

const HOUR = 3_600_000;
// (bossCode, phase1Hp, totalDamage) — 데미지로 돌파 페이즈 수가 갈림(보상 규모 차등).
const SCENARIOS = [
  { boss: 'slime_king' as const, phase1Hp: 10_000, totalDamage: 120_000 }, // ~4페이즈
  { boss: 'dragon_west' as const, phase1Hp: 10_000, totalDamage: 400_000 }, // ~7페이즈
];

async function main() {
  const [prof] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, userId));
  if (!prof) {
    console.error(`프로필 없음: ${userId}`);
    process.exit(1);
  }

  const now = Date.now();
  for (let i = 0; i < SCENARIOS.length; i++) {
    const sc = SCENARIOS[i]!;
    const openedAt = new Date(now - 7 * HOUR); // 7시간 전 개설
    const expireAt = new Date(now - 1 * HOUR); // 1시간 전 만료(이미 종료)
    const shareCode = `test-${now}-${i}`;

    const [raid] = await db
      .insert(schema.raids)
      .values({
        hostUserId: userId,
        bossCode: sc.boss,
        phase1Hp: BigInt(sc.phase1Hp),
        shareCode,
        openedAt,
        expireAt,
        status: 'settled',
        settledAt: new Date(now),
        phasesCleared: 0, // 아래서 갱신
      })
      .returning({ id: schema.raids.id });
    const raidId = raid!.id;

    await db.insert(schema.raidParticipants).values({
      raidId,
      userId,
      attacksUsed: 10,
      extraAttacks: 0,
      totalDamage: BigInt(sc.totalDamage),
      joinedAt: openedAt,
    });

    const phasesCleared = raidPhasesCleared(sc.phase1Hp, sc.totalDamage);
    const { boxes } = aggregatePhaseDrops(raidId, phasesCleared);

    await db.update(schema.raids).set({ phasesCleared }).where(eq(schema.raids.id, raidId));

    await db.insert(schema.raidRewards).values({
      raidId,
      userId,
      // phase_diamond: 다이아 드롭 폐지 → default 0
      boxes,
      claimedAt: null, // 미수령 → 결산 보상 '보상 받기' 노출
    });

    const totalBoxes = boxes.weapon + boxes.armor + boxes.accessory;
    console.log(
      `✓ raid #${raidId} [${sc.boss}] 페이즈 ${phasesCleared} 돌파 → 보급상자 ${totalBoxes}개 (무기 ${boxes.weapon}/방어구 ${boxes.armor}/장신구 ${boxes.accessory}) · /raid/${raidId}`,
    );
  }

  await client.end();
  console.log('\n완료 — /raid 목록 또는 위 링크에서 확인.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
