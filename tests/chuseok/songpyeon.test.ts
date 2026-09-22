import { afterAll, describe, expect, it } from 'vitest';

import {
  CHUSEOK_ACCRUE_END_MS,
  CHUSEOK_CLAIM_END_MS,
  CHUSEOK_START_MS,
  SONGPYEON_EXCHANGE,
  SONGPYEON_LADDER,
  chuseokPhase,
  nextLadderStep,
} from '@/lib/game/chuseok/config';
import { accrueSongpyeon, claimSongpyeonStep, exchangeSongpyeon, getSongpyeonOverview } from '@/lib/game/chuseok/songpyeon';
import { getWalletDiamond, type WalletDb } from '@/lib/game/wallet';

import { endTestDb, sql, testDb } from '../db';

/**
 * 한가위 송편(2026-09-22 확정 규칙) — 순수 규칙 + DB 통합(롤백 tx, 커밋 0).
 * 통합 케이스는 테스트 계정(TEST_USER_ID)의 1서버 캐릭터를 쓰고, 모든 변경은 트랜잭션 롤백으로 사라진다.
 */
const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;
/** 대회 중 시각(적립·수령·교환 모두 가능). */
const IN = new Date(CHUSEOK_START_MS + 3_600_000);
/** 마감 뒤·결과 기간(수령·교환만). */
const AFTER = new Date(CHUSEOK_ACCRUE_END_MS + 3_600_000);

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

describe('송편 규칙(순수)', () => {
  it('사다리는 2026-09-22 확정 수치 그대로이고 상자는 3의 배수', () => {
    expect(SONGPYEON_LADDER.map((l) => [l.at, l.diamond, l.boxes])).toEqual([
      [500, 250, 15],
      [1000, 500, 30],
      [3000, 1000, 60],
      [10000, 2000, 90],
      [20000, 4000, 150],
      [30000, 8000, 300],
    ]);
    for (const l of SONGPYEON_LADDER) expect(l.boxes % 3).toBe(0);
    expect(SONGPYEON_EXCHANGE.box).toEqual({ songpyeon: 300, boxes: 3 });
    expect(SONGPYEON_EXCHANGE.diamond).toEqual({ songpyeon: 400, diamond: 100 });
  });

  it('국면: 시작 전 → 대회(적립) → 결과(수령·교환) → 종료', () => {
    expect(CHUSEOK_START_MS).toBeLessThan(CHUSEOK_ACCRUE_END_MS);
    expect(CHUSEOK_ACCRUE_END_MS).toBeLessThan(CHUSEOK_CLAIM_END_MS);
    expect(chuseokPhase(CHUSEOK_START_MS - 1)).toBe('before');
    expect(chuseokPhase(CHUSEOK_START_MS)).toBe('accrue');
    expect(chuseokPhase(CHUSEOK_ACCRUE_END_MS)).toBe('accrue');
    expect(chuseokPhase(CHUSEOK_ACCRUE_END_MS + 1)).toBe('claim');
    expect(chuseokPhase(CHUSEOK_CLAIM_END_MS + 1)).toBe('ended');
  });

  it('다음 단계 안내', () => {
    expect(nextLadderStep(0)).toEqual({ at: 500, remain: 500 });
    expect(nextLadderStep(1000)).toEqual({ at: 3000, remain: 2000 });
    expect(nextLadderStep(30000)).toBeNull();
  });
});

describe.skipIf(skip)('송편 통합(롤백 tx)', () => {
  it('적립: 같은 잡은 한 번만, 기간 밖은 0, 누적은 도달 단계만큼', async () => {
    await inRollback(async (tx) => {
      const job = `t-${Date.now()}`;
      expect(await accrueSongpyeon({ userId: TEST_USER_ID, serverId: SERVER_ID, jobId: job, level: 347, at: IN }, tx)).toBe(347);
      expect(await accrueSongpyeon({ userId: TEST_USER_ID, serverId: SERVER_ID, jobId: job, level: 347, at: IN }, tx)).toBe(0);
      expect(await accrueSongpyeon({ userId: TEST_USER_ID, serverId: SERVER_ID, jobId: `${job}-b`, level: 200, at: AFTER }, tx)).toBe(0);
      expect(await accrueSongpyeon({ userId: TEST_USER_ID, serverId: SERVER_ID, jobId: `${job}-c`, level: 0, at: IN }, tx)).toBe(0);
      const o = await getSongpyeonOverview(TEST_USER_ID, SERVER_ID, IN, tx);
      expect(o.total).toBe(347);
      expect(o.available).toBe(347);
      expect(o.claimable).toBe(0);
    });
  });

  it('수령: 미도달 거절 → 도달 후 지급(다이아·상자) → 같은 단계 재수령 거절, 종료 뒤 거절', async () => {
    await inRollback(async (tx) => {
      const job = `t-${Date.now()}`;
      expect(await claimSongpyeonStep(TEST_USER_ID, SERVER_ID, 1, IN, tx)).toEqual({ ok: false, reason: 'NOT_REACHED' });
      await accrueSongpyeon({ userId: TEST_USER_ID, serverId: SERVER_ID, jobId: job, level: 600, at: IN }, tx);
      const before = await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID);
      const [bx] = (await tx.execute(sql`
        select coalesce(sum(count), 0)::int as c from user_supply_boxes where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
      `)) as unknown as { c: number }[];
      const r = await claimSongpyeonStep(TEST_USER_ID, SERVER_ID, 1, IN, tx);
      expect(r).toEqual({ ok: true, step: 1, diamond: 250, boxes: 15 });
      expect(await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID)).toBe(before + 250n);
      const [bx2] = (await tx.execute(sql`
        select coalesce(sum(count), 0)::int as c from user_supply_boxes where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
      `)) as unknown as { c: number }[];
      expect(bx2.c - bx.c).toBe(15);
      expect(await claimSongpyeonStep(TEST_USER_ID, SERVER_ID, 1, IN, tx)).toEqual({ ok: false, reason: 'ALREADY' });
      expect(await claimSongpyeonStep(TEST_USER_ID, SERVER_ID, 2, IN, tx)).toEqual({ ok: false, reason: 'NOT_REACHED' });
      // 결과 기간에도 받을 수 있고, 종료 뒤엔 안 된다.
      expect(await claimSongpyeonStep(TEST_USER_ID, SERVER_ID, 9, AFTER, tx)).toEqual({ ok: false, reason: 'UNKNOWN_STEP' });
      expect(await claimSongpyeonStep(TEST_USER_ID, SERVER_ID, 2, new Date(CHUSEOK_CLAIM_END_MS + 1), tx)).toEqual({ ok: false, reason: 'CLOSED' });
      const o = await getSongpyeonOverview(TEST_USER_ID, SERVER_ID, IN, tx);
      expect(o.claimed).toEqual([1]);
      // 수령은 누적을 줄이지 않는다.
      expect(o.total).toBe(600);
      expect(o.available).toBe(600);
    });
  });

  it('교환: 부족 거절 → 다이아 교환은 사용 가능만 줄고 누적은 그대로 → 상자 교환 → 개수 검증', async () => {
    await inRollback(async (tx) => {
      const job = `t-${Date.now()}`;
      await accrueSongpyeon({ userId: TEST_USER_ID, serverId: SERVER_ID, jobId: job, level: 1_000, at: IN }, tx);
      expect(await exchangeSongpyeon(TEST_USER_ID, SERVER_ID, 'diamond', 3, IN, tx)).toEqual({ ok: false, reason: 'INSUFFICIENT' });
      const before = await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID);
      const r = await exchangeSongpyeon(TEST_USER_ID, SERVER_ID, 'diamond', 2, AFTER, tx);
      expect(r).toEqual({ ok: true, kind: 'diamond', count: 2, cost: 800, diamond: 200, boxes: 0, available: 200 });
      expect(await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID)).toBe(before + 200n);
      const o = await getSongpyeonOverview(TEST_USER_ID, SERVER_ID, IN, tx);
      expect(o.total).toBe(1_000);
      expect(o.spent).toBe(800);
      expect(o.available).toBe(200);
      // 누적 1,000이라 1단계(500)·2단계(1,000) 모두 받을 수 있다 — 교환은 도달 보상에 영향 없음.
      expect(o.claimable).toBe(2);
      expect(await exchangeSongpyeon(TEST_USER_ID, SERVER_ID, 'box', 1, IN, tx)).toEqual({ ok: false, reason: 'INSUFFICIENT' });
      expect(await exchangeSongpyeon(TEST_USER_ID, SERVER_ID, 'box', 0, IN, tx)).toEqual({ ok: false, reason: 'BAD_COUNT' });
      expect(await exchangeSongpyeon(TEST_USER_ID, SERVER_ID, 'box', 1, new Date(CHUSEOK_CLAIM_END_MS + 1), tx)).toEqual({ ok: false, reason: 'CLOSED' });
      // 원장 합 = 지갑(정본 일치).
      const [led] = (await tx.execute(sql`
        select coalesce(sum(delta) filter (where kind = 'earn'), 0)::int as earn,
               coalesce(-sum(delta) filter (where kind = 'exchange'), 0)::int as spent
          from chuseok_songpyeon_ledger where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
      `)) as unknown as { earn: number; spent: number }[];
      expect(led.earn).toBe(1_000);
      expect(led.spent).toBe(800);
    });
  });
});
