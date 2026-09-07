import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { TITLE_DISCOVERY_DIAMOND, TITLE_MILESTONE_STEP } from '@/lib/game/balance';
import { claimTitleRewards, splitBoxesUneven, summarizeTitleRewards } from '@/lib/game/titles/rewards';

import { endTestDb, sql, testDb } from '../db';

/**
 * 칭호 발견 보상(0191) — 순수 요약/분배 + 실제 DB 수령(멱등). 커밋형이라 cleanup 패턴:
 * 테스트 유저의 기존 미수령분은 먼저 수령 처리해 두고, 합성 칭호(test_reward_*)로 정확한 수를 만든다.
 */
const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SID = 1;

describe('titles/rewards — 순수', () => {
  it('상자 불균등 분배: 50 → 17/17/16, 100 → 34/33/33, 3 → 1/1/1', () => {
    expect(splitBoxesUneven(50)).toEqual({ weapon: 17, armor: 17, accessory: 16 });
    expect(splitBoxesUneven(100)).toEqual({ weapon: 34, armor: 33, accessory: 33 });
    expect(splitBoxesUneven(3)).toEqual({ weapon: 1, armor: 1, accessory: 1 });
  });
  it('요약: 미수령 수·도달 미수령 단계·다음 단계', () => {
    const ledger = Array.from({ length: 52 }, (_, i) => ({ reward_claimed_at: i < 10 ? new Date() : null }));
    expect(summarizeTitleRewards(ledger, [])).toEqual({ unclaimedTitles: 42, discovered: 52, claimableMilestones: [50], nextMilestone: 100 });
    expect(summarizeTitleRewards(ledger, [50])).toMatchObject({ claimableMilestones: [] });
    expect(summarizeTitleRewards([], [])).toEqual({ unclaimedTitles: 0, discovered: 0, claimableMilestones: [], nextMilestone: TITLE_MILESTONE_STEP });
  });
});

async function diamond(): Promise<number> {
  const r = (await testDb.execute(sql`select diamond::text as d from characters where user_id=${TEST_USER_ID}::uuid and server_id=${SID}`)) as unknown as { d: string }[];
  return Number(r[0]?.d ?? 0);
}
async function boxes(): Promise<number> {
  const r = (await testDb.execute(sql`select coalesce(sum(count),0)::text as n from user_supply_boxes where user_id=${TEST_USER_ID}::uuid and server_id=${SID}`)) as unknown as { n: string }[];
  return Number(r[0]?.n ?? 0);
}
async function discovered(): Promise<number> {
  const r = (await testDb.execute(sql`select count(*)::int as c from user_titles where user_id=${TEST_USER_ID}::uuid and server_id=${SID}`)) as unknown as { c: number }[];
  return r[0]!.c;
}

describe.skipIf(skip)('titles/rewards — DB 수령(멱등)', () => {
  let seeded: string[] = [];
  let grantedDiamond = 0;
  let grantedBoxes = 0;
  const seed = async (n: number) => {
    const base = await discovered();
    for (let i = 0; i < n; i++) {
      const code = `test_reward_${process.pid}_${base}_${i}`;
      await testDb.execute(sql`insert into user_titles (user_id, server_id, title_code, earned_at, seen_at) values (${TEST_USER_ID}::uuid, ${SID}, ${code}, now(), now()) on conflict do nothing`);
      seeded.push(code);
    }
  };
  beforeAll(async () => {
    // 이전 실행 잔재 제거 후, 기존 미수령분·도달 단계는 미리 수령 처리(합성분만 측정). 지급 재화는 afterAll에서 되돌린다.
    await testDb.execute(sql`delete from user_titles where user_id=${TEST_USER_ID}::uuid and server_id=${SID} and title_code like 'test_reward_%'`);
    // 이전 실행이 합성 칭호로 만든 달성 기록도 제거(실제 발견 수보다 큰 단계).
    const c0 = await discovered();
    await testDb.execute(sql`delete from title_milestone_claims where user_id=${TEST_USER_ID}::uuid and server_id=${SID} and count > ${c0}`);
    const pre = await claimTitleRewards(TEST_USER_ID, SID);
    grantedDiamond += pre.diamond; grantedBoxes += pre.boxes.weapon + pre.boxes.armor + pre.boxes.accessory;
  });
  const cleanSeeded = async () => {
    await testDb.execute(sql`delete from user_titles where user_id=${TEST_USER_ID}::uuid and server_id=${SID} and title_code like 'test_reward_%'`);
    seeded = [];
  };
  afterEach(cleanSeeded);
  afterAll(async () => {
    // 테스트가 넣은 달성 기록 제거(실제 발견 수 기준으로 다시 계산되게) + 지급 재화 회수.
    await cleanSeeded();
    const c = await discovered();
    await testDb.execute(sql`delete from title_milestone_claims where user_id=${TEST_USER_ID}::uuid and server_id=${SID} and count > ${c}`);
    if (grantedDiamond > 0) await testDb.execute(sql`update characters set diamond = greatest(0, diamond - ${grantedDiamond}) where user_id=${TEST_USER_ID}::uuid and server_id=${SID}`);
    if (grantedBoxes > 0) await testDb.execute(sql`update user_supply_boxes set count = greatest(0, count - ${grantedBoxes}) where user_id=${TEST_USER_ID}::uuid and server_id=${SID} and slot='weapon'`);
    await endTestDb();
  });

  it('미수령 3개 → 💎60 지급, 재호출은 0(멱등)', async () => {
    await seed(3);
    const d0 = await diamond();
    const r = await claimTitleRewards(TEST_USER_ID, SID);
    grantedDiamond += r.diamond; grantedBoxes += r.boxes.weapon + r.boxes.armor + r.boxes.accessory;
    expect(r.titles).toBe(3);
    expect(r.diamond).toBe(3 * TITLE_DISCOVERY_DIAMOND);
    expect(await diamond()).toBe(d0 + 3 * TITLE_DISCOVERY_DIAMOND);
    const again = await claimTitleRewards(TEST_USER_ID, SID);
    expect(again).toMatchObject({ titles: 0, diamond: 0, milestones: [] });
  });

  it('발견 수가 다음 50 배수에 닿으면 그 개수만큼 상자, 한 번만', async () => {
    const base = await discovered();
    const target = (Math.floor(base / TITLE_MILESTONE_STEP) + 1) * TITLE_MILESTONE_STEP;
    await seed(target - base);
    const b0 = await boxes();
    const r = await claimTitleRewards(TEST_USER_ID, SID);
    grantedDiamond += r.diamond; grantedBoxes += r.boxes.weapon + r.boxes.armor + r.boxes.accessory;
    expect(r.milestones).toEqual([target]);
    expect(r.boxes.weapon + r.boxes.armor + r.boxes.accessory).toBe(target);
    expect(await boxes()).toBe(b0 + target);
    const again = await claimTitleRewards(TEST_USER_ID, SID);
    expect(again.milestones).toEqual([]);
  });
});
