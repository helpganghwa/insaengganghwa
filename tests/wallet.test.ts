import { afterAll, describe, expect, it } from 'vitest';

import { getWalletDiamond, walletAdd, walletTrySpend, type WalletDb } from '@/lib/game/wallet';

import { endTestDb, testDb } from './db';

/**
 * wallet — 모든 자원 경로의 원자 프리미티브(characters.diamond 단일 경로). 결제·강화·보급·
 * 정산이 전부 이 3함수를 거치므로 직접 회귀 테스트가 최상위 안전망.
 *
 * 공유 prod DB를 쓰므로 각 케이스를 **트랜잭션 안에서 실행 후 강제 롤백** — 실제 계정 잔액을
 * 전혀 건드리지 않는다(finally-cleanup보다 안전). wallet 3함수 모두 WalletDb(tx)를 받아 가능.
 */

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1; // 테스트 계정이 캐릭터를 보유한 서버(결제 테스트와 동일 가정).
const NO_CHAR_SERVER = 30_000; // 캐릭터가 존재하지 않는 서버 id(server_id=smallint, ≤32767).

class Rollback extends Error {}
/** fn을 트랜잭션에서 실행하고 항상 롤백 — 커밋되는 변경 0. */
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

describe.skipIf(skip)('wallet — 자원 원자 프리미티브', () => {
  it('walletAdd: 잔액이 정확히 amount만큼 증가', async () => {
    await inRollback(async (tx) => {
      const before = await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID);
      await walletAdd(tx, TEST_USER_ID, SERVER_ID, 500);
      const after = await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID);
      expect(after).toBe(before + 500n);
    });
  });

  it('walletTrySpend: 잔액 이내면 차감 후 true', async () => {
    await inRollback(async (tx) => {
      await walletAdd(tx, TEST_USER_ID, SERVER_ID, 1000); // 확정 잔액 확보
      const before = await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID);
      const ok = await walletTrySpend(tx, TEST_USER_ID, SERVER_ID, 300);
      expect(ok).toBe(true);
      const after = await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID);
      expect(after).toBe(before - 300n);
    });
  });

  it('walletTrySpend: 잔액 초과면 false·차감 없음(원자성)', async () => {
    await inRollback(async (tx) => {
      const before = await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID);
      const ok = await walletTrySpend(tx, TEST_USER_ID, SERVER_ID, before + 1n);
      expect(ok).toBe(false);
      const after = await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID);
      expect(after).toBe(before); // 조건부 UPDATE라 미차감
    });
  });

  it('walletTrySpend: 정확히 잔액 전액이면 성공(경계, after=0)', async () => {
    await inRollback(async (tx) => {
      const before = await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID);
      const ok = await walletTrySpend(tx, TEST_USER_ID, SERVER_ID, before);
      expect(ok).toBe(true);
      const after = await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID);
      expect(after).toBe(0n);
    });
  });

  it('walletTrySpend 두 번: 잔액이 한 번만 차감(이중지출 방지)', async () => {
    await inRollback(async (tx) => {
      await walletAdd(tx, TEST_USER_ID, SERVER_ID, 100);
      const before = await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID);
      const first = await walletTrySpend(tx, TEST_USER_ID, SERVER_ID, before);
      const second = await walletTrySpend(tx, TEST_USER_ID, SERVER_ID, 1); // 이미 0 → 실패
      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(await getWalletDiamond(tx, TEST_USER_ID, SERVER_ID)).toBe(0n);
    });
  });

  it('walletAdd: 캐릭터 부재 서버면 WALLET_CHARACTER_MISSING throw(조용한 유실 방지)', async () => {
    await expect(
      testDb.transaction(async (tx) => {
        await walletAdd(tx as WalletDb, TEST_USER_ID, NO_CHAR_SERVER, 1);
      }),
    ).rejects.toThrow(/WALLET_CHARACTER_MISSING/);
  });

  it('getWalletDiamond: 캐릭터 부재면 0n(읽기 전용)', async () => {
    const d = await getWalletDiamond(testDb as unknown as WalletDb, TEST_USER_ID, NO_CHAR_SERVER);
    expect(d).toBe(0n);
  });
});
