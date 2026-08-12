import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { applyNicknameChange } from '@/lib/game/nickname-change';
import { NICKNAME_CHANGE_COST_DIAMOND } from '@/lib/game/balance';

import { endTestDb, testDb } from './db';

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;

const one = <T>(rows: unknown) => (rows as T[])[0]!;

/** 트랜잭션을 반드시 되돌리기 위한 표식 — 커밋되면 테스트 유저의 닉네임이 실제로 바뀐다. */
class Rollback extends Error {}

/**
 * 닉네임 변경이 원장을 남기는지 — changeNicknameAction의 트랜잭션 본문을 그대로 재현한다.
 *
 * 액션은 세션을 요구해 직접 부를 수 없지만, 트랜잭션 본문(applyNicknameChange)은 별도 모듈이라
 * **액션과 같은 코드**를 돌릴 수 있다. 그 본문을 실행하고 **던져서 롤백**한다.
 * 검증 대상은 "차감이 지갑 헬퍼를 지나 diamond_ledger에 reason='nickname_change'로 남는가"다.
 * 본문이 다시 raw UPDATE로 돌아가면 원장 행이 0이 되어 이 테스트가 깨진다.
 *
 * 예전엔 단일 CTE가 characters.diamond를 직접 깎아 원장에 아무 흔적이 없었다. LedgerReason에
 * 'nickname_change'가 선언만 되어 있고 호출부가 없던 상태라, 원장을 근거로 삼는 집계(칭호의
 * 다이아 소비 판정 등)가 이 금액만큼 과소 집계됐다(2026-08-12 재검증에서 발견).
 */
describe.skipIf(skip)('닉네임 변경 — 차감이 원장에 남는다', () => {
  afterAll(async () => {
    await endTestDb();
  });

  it('walletTrySpend 경유로 nickname_change 원장 행이 생긴다(롤백)', async () => {
    const before = one<{ nick: string; dia: string }>(
      await testDb.execute(sql`
        select nickname as nick, diamond::text as dia from characters
        where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`),
    );
    expect(BigInt(before.dia)).toBeGreaterThanOrEqual(BigInt(NICKNAME_CHANGE_COST_DIAMOND));

    let seen: { n: number; delta: string; dia: string; nick: string } | null = null;
    await expect(
      testDb.transaction(async (tx) => {
        // 액션이 부르는 바로 그 본문.
        const nextNick = `테스트닉${process.pid % 10000}`;
        const r = await applyNicknameChange(tx, TEST_USER_ID, SERVER_ID, nextNick);
        expect(r.ok).toBe(true);
        // 첫 변경이면 무료라 원장이 안 생긴다 — 테스트 계정은 이미 변경 이력이 있어야 한다.
        expect(r.ok && r.charged).toBe(NICKNAME_CHANGE_COST_DIAMOND);

        const led = one<{ n: number; delta: string }>(
          await tx.execute(sql`
            select count(*)::int n, coalesce(min(delta), 0)::text delta from diamond_ledger
            where user_id = ${TEST_USER_ID}::uuid and reason = 'nickname_change'`),
        );
        const now = one<{ dia: string; nick: string }>(
          await tx.execute(sql`
            select diamond::text dia, nickname as nick from characters
            where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`),
        );
        seen = { n: led.n, delta: led.delta, dia: now.dia, nick: now.nick };
        throw new Rollback(); // 커밋 금지 — 공유 테스트 계정의 닉네임을 실제로 바꾸면 안 된다.
      }),
    ).rejects.toThrow(Rollback);

    const s = seen as unknown as { n: number; delta: string; dia: string; nick: string };
    expect(s.n).toBe(1); // 원장 행이 **생겼다** — 이게 이 수정의 핵심
    expect(BigInt(s.delta)).toBe(BigInt(-NICKNAME_CHANGE_COST_DIAMOND)); // 소모는 음수
    expect(BigInt(s.dia)).toBe(BigInt(before.dia) - BigInt(NICKNAME_CHANGE_COST_DIAMOND));
    expect(s.nick).not.toBe(before.nick);

    // 롤백 확인 — 닉네임·잔액·원장 어느 것도 남지 않는다.
    const after = one<{ nick: string; dia: string }>(
      await testDb.execute(sql`
        select nickname as nick, diamond::text as dia from characters
        where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`),
    );
    expect(after.nick).toBe(before.nick);
    expect(after.dia).toBe(before.dia);
    const leftover = one<{ n: number }>(
      await testDb.execute(sql`
        select count(*)::int n from diamond_ledger
        where user_id = ${TEST_USER_ID}::uuid and reason = 'nickname_change'`),
    );
    expect(leftover.n).toBe(0);
  }, 30_000);
});
