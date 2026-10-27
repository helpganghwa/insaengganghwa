import { afterAll, describe, expect, it } from 'vitest';

import {
  HALLOWEEN_ACCRUE_END_MS,
  HALLOWEEN_CLAIM_END_MS,
  HALLOWEEN_START_MS,
  CANDY_EXCHANGE,
  CANDY_LADDER,
  halloweenPhase,
  nextCandyStep,
} from '@/lib/game/halloween/config';
import { accrueCandy, claimCandyStep, exchangeCandy, exchangeCandyForItem, getCandyOverview } from '@/lib/game/halloween/candy';
import { allowedItemCopies } from '@/lib/game/halloween/item-exchange';
import { getWalletDiamond, type WalletDb } from '@/lib/game/wallet';

import { endTestDb, sql, testDb } from '../db';

/**
 * 할로윈 사탕(2026-10-20 확정 규칙) — 순수 규칙 + DB 통합(롤백 tx, 커밋 0).
 * 통합 케이스는 테스트 계정(TEST_USER_ID)의 1서버 캐릭터를 쓰고, 모든 변경은 트랜잭션 롤백으로 사라진다.
 */
const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;
/** 대회 중 시각(적립·수령·교환 모두 가능). */
const IN = new Date(HALLOWEEN_START_MS + 3_600_000);
/** 마감 뒤·결과 기간(수령·교환만). */
const AFTER = new Date(HALLOWEEN_ACCRUE_END_MS + 3_600_000);

class Rollback extends Error {}
async function inRollback(fn: (tx: WalletDb) => Promise<void>): Promise<void> {
  try {
    await testDb.transaction(async (tx) => {
      await fn(tx as WalletDb);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

afterAll(async () => {
  await endTestDb();
});

describe('사탕 규칙(순수)', () => {
  it('사다리는 확정 수치 그대로(10-20: 끝 15만·9단계, 💎 10%·📦 0.3%)이고 상자는 3의 배수', () => {
    expect(CANDY_LADDER.map((l) => [l.at, l.diamond, l.boxes])).toEqual([
      [1000, 100, 3],
      [3000, 300, 9],
      [7000, 700, 21],
      [15000, 1500, 45],
      [25000, 2500, 75],
      [40000, 4000, 120],
      [60000, 6000, 180],
      [100000, 10000, 300],
      [150000, 15000, 450],
    ]);
    for (const l of CANDY_LADDER) {
      expect(l.boxes % 3).toBe(0);
      expect(l.diamond).toBe(l.at / 10);
      expect(l.boxes).toBe((l.at * 3) / 1000);
    }
    expect(CANDY_LADDER.reduce((a, l) => a + l.diamond, 0)).toBe(40_100);
    expect(CANDY_LADDER.reduce((a, l) => a + l.boxes, 0)).toBe(1_203);
    // 칭호는 6만·15만 단계(2026-10-26 확정).
    expect(CANDY_LADDER.filter((l) => l.title).map((l) => [l.at, l.title])).toEqual([
      [60000, 'halloween26_candy1'],
      [150000, 'halloween26_candy3'],
    ]);
    expect(CANDY_EXCHANGE.box).toEqual({ candy: 300, boxes: 3 });
    expect(CANDY_EXCHANGE.diamond).toEqual({ candy: 400, diamond: 100 });
  });

  it('국면: 시작 전 → 대회(적립) → 결과(수령·교환) → 종료', () => {
    expect(HALLOWEEN_START_MS).toBeLessThan(HALLOWEEN_ACCRUE_END_MS);
    expect(HALLOWEEN_ACCRUE_END_MS).toBeLessThan(HALLOWEEN_CLAIM_END_MS);
    expect(halloweenPhase(HALLOWEEN_START_MS - 1)).toBe('before');
    expect(halloweenPhase(HALLOWEEN_START_MS)).toBe('accrue');
    expect(halloweenPhase(HALLOWEEN_ACCRUE_END_MS)).toBe('accrue');
    expect(halloweenPhase(HALLOWEEN_ACCRUE_END_MS + 1)).toBe('claim');
    expect(halloweenPhase(HALLOWEEN_CLAIM_END_MS + 1)).toBe('ended');
  });

  it('다음 단계 안내', () => {
    expect(nextCandyStep(0)).toEqual({ at: 1000, remain: 1000 });
    expect(nextCandyStep(1000)).toEqual({ at: 3000, remain: 2000 });
    expect(nextCandyStep(40000)).toEqual({ at: 60000, remain: 20000 });
    expect(nextCandyStep(150000)).toBeNull();
  });
});

describe.skipIf(skip)('사탕 통합(롤백 tx)', () => {
  it('적립: 같은 잡은 한 번만, 기간 밖은 0, 누적은 도달 단계만큼', async () => {
    await inRollback(async (tx) => {
      const job = `t-${Date.now()}`;
      expect(await accrueCandy({ userId: TEST_USER_ID, serverId: SERVER_ID, jobId: job, level: 347, at: IN }, tx)).toBe(347);
      expect(await accrueCandy({ userId: TEST_USER_ID, serverId: SERVER_ID, jobId: job, level: 347, at: IN }, tx)).toBe(0);
      expect(await accrueCandy({ userId: TEST_USER_ID, serverId: SERVER_ID, jobId: `${job}-b`, level: 200, at: AFTER }, tx)).toBe(0);
      expect(await accrueCandy({ userId: TEST_USER_ID, serverId: SERVER_ID, jobId: `${job}-c`, level: 0, at: IN }, tx)).toBe(0);
      const o = await getCandyOverview(TEST_USER_ID, SERVER_ID, IN, tx);
      expect(o.total).toBe(347);
      expect(o.available).toBe(347);
      expect(o.claimable).toBe(0);
    });
  });

  it('수령: 미도달 거절 → 도달 후 지급(다이아·상자) → 같은 단계 재수령 거절, 종료 뒤 거절', async () => {
    await inRollback(async (tx) => {
      const job = `t-${Date.now()}`;
      expect(await claimCandyStep(TEST_USER_ID, SERVER_ID, 1, IN, tx)).toEqual({ ok: false, reason: 'NOT_REACHED' });
      await accrueCandy({ userId: TEST_USER_ID, serverId: SERVER_ID, jobId: job, level: 1_200, at: IN }, tx);
      const before = await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID);
      const [bx] = (await tx.execute(sql`
        select coalesce(sum(count), 0)::int as c from user_supply_boxes where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
      `)) as unknown as { c: number }[];
      const r = await claimCandyStep(TEST_USER_ID, SERVER_ID, 1, IN, tx);
      expect(r).toEqual({ ok: true, step: 1, diamond: 100, boxes: 3, title: null });
      expect(await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID)).toBe(before + 100n);
      const [bx2] = (await tx.execute(sql`
        select coalesce(sum(count), 0)::int as c from user_supply_boxes where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
      `)) as unknown as { c: number }[];
      expect(bx2.c - bx.c).toBe(3);
      expect(await claimCandyStep(TEST_USER_ID, SERVER_ID, 1, IN, tx)).toEqual({ ok: false, reason: 'ALREADY' });
      expect(await claimCandyStep(TEST_USER_ID, SERVER_ID, 2, IN, tx)).toEqual({ ok: false, reason: 'NOT_REACHED' });
      // 결과 기간에도 받을 수 있고, 종료 뒤엔 안 된다.
      expect(await claimCandyStep(TEST_USER_ID, SERVER_ID, 10, AFTER, tx)).toEqual({ ok: false, reason: 'UNKNOWN_STEP' });
      expect(await claimCandyStep(TEST_USER_ID, SERVER_ID, 2, new Date(HALLOWEEN_CLAIM_END_MS + 1), tx)).toEqual({ ok: false, reason: 'CLOSED' });
      const o = await getCandyOverview(TEST_USER_ID, SERVER_ID, IN, tx);
      expect(o.claimed).toEqual([1]);
      // 수령은 누적을 줄이지 않는다.
      expect(o.total).toBe(1_200);
      expect(o.available).toBe(1_200);
    });
  });

  it('칭호 단계: 4만(6단계)은 칭호 없이, 정확히 6만이면 7단계(💎6,000·📦180)와 칭호를 함께 받고, 15만에서 9단계 칭호까지', async () => {
    await inRollback(async (tx) => {
      const job = `t-${Date.now()}`;
      await accrueCandy({ userId: TEST_USER_ID, serverId: SERVER_ID, jobId: job, level: 60_000, at: IN }, tx);
      const before = await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID);
      expect(await claimCandyStep(TEST_USER_ID, SERVER_ID, 6, IN, tx)).toEqual({ ok: true, step: 6, diamond: 4_000, boxes: 120, title: null });
      expect(await claimCandyStep(TEST_USER_ID, SERVER_ID, 7, IN, tx)).toEqual({ ok: true, step: 7, diamond: 6_000, boxes: 180, title: 'halloween26_candy1' });
      expect(await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID)).toBe(before + 10_000n);
      expect(await claimCandyStep(TEST_USER_ID, SERVER_ID, 8, IN, tx)).toEqual({ ok: false, reason: 'NOT_REACHED' });
      const titles = async () =>
        ((await tx.execute(sql`
          select title_code from user_titles
           where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID} and title_code like 'halloween26_%' order by title_code
        `)) as unknown as { title_code: string }[]).map((r) => r.title_code);
      expect(await titles()).toEqual(['halloween26_candy1']);
      await accrueCandy({ userId: TEST_USER_ID, serverId: SERVER_ID, jobId: `${job}-b`, level: 90_000, at: IN }, tx);
      expect(await claimCandyStep(TEST_USER_ID, SERVER_ID, 8, IN, tx)).toEqual({ ok: true, step: 8, diamond: 10_000, boxes: 300, title: null });
      expect(await claimCandyStep(TEST_USER_ID, SERVER_ID, 9, AFTER, tx)).toEqual({ ok: true, step: 9, diamond: 15_000, boxes: 450, title: 'halloween26_candy3' });
      expect(await claimCandyStep(TEST_USER_ID, SERVER_ID, 9, AFTER, tx)).toEqual({ ok: false, reason: 'ALREADY' });
      expect(await titles()).toEqual(['halloween26_candy1', 'halloween26_candy3']);
    });
  });

  it('교환: 부족 거절 → 다이아 교환은 사용 가능만 줄고 누적은 그대로 → 상자 교환 → 개수 검증', async () => {
    await inRollback(async (tx) => {
      const job = `t-${Date.now()}`;
      await accrueCandy({ userId: TEST_USER_ID, serverId: SERVER_ID, jobId: job, level: 1_000, at: IN }, tx);
      expect(await exchangeCandy(TEST_USER_ID, SERVER_ID, 'diamond', 3, IN, tx)).toEqual({ ok: false, reason: 'INSUFFICIENT' });
      const before = await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID);
      const r = await exchangeCandy(TEST_USER_ID, SERVER_ID, 'diamond', 2, AFTER, tx);
      expect(r).toEqual({ ok: true, kind: 'diamond', count: 2, cost: 800, diamond: 200, boxes: 0, available: 200 });
      expect(await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID)).toBe(before + 200n);
      const o = await getCandyOverview(TEST_USER_ID, SERVER_ID, IN, tx);
      expect(o.total).toBe(1_000);
      expect(o.spent).toBe(800);
      expect(o.available).toBe(200);
      // 누적 1,000이라 1단계(1,000)를 받을 수 있다 — 교환은 도달 보상에 영향 없음.
      expect(o.claimable).toBe(1);
      expect(await exchangeCandy(TEST_USER_ID, SERVER_ID, 'box', 1, IN, tx)).toEqual({ ok: false, reason: 'INSUFFICIENT' });
      expect(await exchangeCandy(TEST_USER_ID, SERVER_ID, 'box', 0, IN, tx)).toEqual({ ok: false, reason: 'BAD_COUNT' });
      expect(await exchangeCandy(TEST_USER_ID, SERVER_ID, 'box', 1, new Date(HALLOWEEN_CLAIM_END_MS + 1), tx)).toEqual({ ok: false, reason: 'CLOSED' });
      // 원장 합 = 지갑(정본 일치).
      const [led] = (await tx.execute(sql`
        select coalesce(sum(delta) filter (where kind = 'earn'), 0)::int as earn,
               coalesce(-sum(delta) filter (where kind = 'exchange'), 0)::int as spent
          from halloween_candy_ledger where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
      `)) as unknown as { earn: number; spent: number }[];
      expect(led.earn).toBe(1_000);
      expect(led.spent).toBe(800);
    });
  });

  it('장비 교환: 사탕 100에 1개, 미보유 → 획득(T0), 상한(내 최고 초월) 초과·사탕 부족·잘못된 코드·기간 종료 거절', async () => {
    await inRollback(async (tx) => {
      await accrueCandy({ userId: TEST_USER_ID, serverId: SERVER_ID, jobId: `t-${Date.now()}-item`, level: 1_000, at: IN }, tx);
      const o = await getCandyOverview(TEST_USER_ID, SERVER_ID, IN, tx);
      expect(o.items.map((i) => i.code)).toEqual([
        'halloween_smith_hammer', 'halloween_smith_apron', 'halloween_smith_scarf', 'halloween_vamp_parasol', 'halloween_vamp_cape', 'halloween_vamp_tophat',
      ]);
      for (const it of o.items) expect(it.allowed).toBe(allowedItemCopies(o.maxTranscend, it.owned ? { level: it.level, progress: it.progress } : null));
      expect(await exchangeCandyForItem(TEST_USER_ID, SERVER_ID, 'nope', 1, IN, tx)).toEqual({ ok: false, reason: 'BAD_ITEM' });
      expect(await exchangeCandyForItem(TEST_USER_ID, SERVER_ID, 'halloween_smith_hammer', 0, IN, tx)).toEqual({ ok: false, reason: 'BAD_COUNT' });
      expect(await exchangeCandyForItem(TEST_USER_ID, SERVER_ID, 'halloween_smith_hammer', 1, new Date(HALLOWEEN_CLAIM_END_MS + 1), tx)).toEqual({ ok: false, reason: 'CLOSED' });
      // 사탕 부족이 상한보다 먼저 걸린다(1,000 사탕 = 10개).
      expect(await exchangeCandyForItem(TEST_USER_ID, SERVER_ID, 'halloween_smith_hammer', 11, IN, tx)).toEqual({ ok: false, reason: 'INSUFFICIENT' });
      const target = o.items.find((i) => !i.owned) ?? o.items[0]!;
      if (target.allowed === 0) {
        expect(await exchangeCandyForItem(TEST_USER_ID, SERVER_ID, target.code, 1, IN, tx)).toEqual({ ok: false, reason: 'CAP' });
        return;
      }
      const r = await exchangeCandyForItem(TEST_USER_ID, SERVER_ID, target.code, 1, IN, tx);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.cost).toBe(100);
      expect(r.available).toBe(900);
      expect(r.item.owned).toBe(true);
      expect(r.acquired).toBe(!target.owned);
      expect(r.item.allowed).toBe(target.allowed - 1);
      const [row] = (await tx.execute(sql`
        select ue.transcend_level::int as level, ue.transcend_progress::int as progress from user_equipment ue
          join catalog_items ci on ci.id = ue.catalog_item_id
         where ue.user_id = ${TEST_USER_ID}::uuid and ue.server_id = ${SERVER_ID} and ci.code = ${target.code}
      `)) as unknown as { level: number; progress: number }[];
      expect(row).toBeDefined();
      expect(row!.level).toBe(r.item.level);
      expect(row!.progress).toBe(r.item.progress);
      // 상한을 넘기는 개수는 거절, 상한까지는 허용(사탕이 있으면).
      if (r.item.allowed + 1 <= 9) expect(await exchangeCandyForItem(TEST_USER_ID, SERVER_ID, target.code, r.item.allowed + 1, IN, tx)).toEqual({ ok: false, reason: 'CAP' });
      const o2 = await getCandyOverview(TEST_USER_ID, SERVER_ID, IN, tx);
      expect(o2.available).toBe(900);
      expect(o2.total).toBe(1_000);
      const [led] = (await tx.execute(sql`
        select coalesce(sum(delta) filter (where kind = 'exchange'), 0)::int as ex from halloween_candy_ledger
         where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
      `)) as unknown as { ex: number }[];
      expect(led!.ex).toBe(-100);
    });
  });
});
