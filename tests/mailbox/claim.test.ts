import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { claimAllMail, claimMail, MailError } from '@/lib/game/mailbox/claim';

import { endTestDb, sql, testDb } from '../db';

/**
 * mailbox/claim — 비동기 보상(레이드 정산·프로필 결과 등) 수령 정산 프리미티브.
 * claimMail/claimAllMail이 자체 tx를 열어(외부 tx 미수용) 롤백 불가 → cleanup 패턴.
 * box 지급 경로는 shop/grant 테스트가 커버하므로 여기선 diamond 중심(cleanup 단순화).
 * 회귀 포인트: 멱등(claimed_at 게이트)·만료 차단·string payload 폭증 방지(toInt)·claimAll 합산.
 */

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SID = 1;
const SENDER = 'TEST_MAIL_수령'; // 정리 식별용.

async function insertMail(payload: object, expiry: 'future' | 'past' = 'future'): Promise<bigint> {
  const days = expiry === 'past' ? -1 : 1;
  const r = (await testDb.execute(sql`
    insert into mailbox (user_id, server_id, type, title, sender_label, payload, expires_at)
    values (${TEST_USER_ID}::uuid, ${SID}, 'reward', 'test', ${SENDER},
      ${JSON.stringify(payload)}::jsonb, now() + make_interval(days => ${days}))
    returning id::text id
  `)) as unknown as { id: string }[];
  return BigInt(r[0]!.id);
}
async function readDiamond(): Promise<bigint> {
  const r = (await testDb.execute(
    sql`select diamond::text d from characters where user_id = ${TEST_USER_ID}::uuid and server_id = ${SID}`,
  )) as unknown as { d: string }[];
  return BigInt(r[0]?.d ?? '0');
}

let baselineDiamond: bigint;

beforeEach(async () => {
  baselineDiamond = await readDiamond();
});
afterEach(async () => {
  await testDb.execute(sql`delete from mail_claim_logs where user_id = ${TEST_USER_ID}::uuid`);
  await testDb.execute(
    sql`delete from mailbox where user_id = ${TEST_USER_ID}::uuid and sender_label = ${SENDER}`,
  );
  await testDb.execute(
    sql`update characters set diamond = ${baselineDiamond.toString()}::bigint where user_id = ${TEST_USER_ID}::uuid and server_id = ${SID}`,
  );
});
afterAll(async () => {
  await endTestDb();
});

describe.skipIf(skip)('mailbox/claim — 비동기 보상 수령', () => {
  it('claimMail: payload 다이아 지급 + claimed_at 마킹 + 감사 로그', async () => {
    const id = await insertMail({ diamond: 1500 });
    const r = await claimMail({ userId: TEST_USER_ID, serverId: SID, mailId: id });
    expect(r.diamond).toBe(1500);
    expect(await readDiamond()).toBe(baselineDiamond + 1500n);

    const [m] = (await testDb.execute(
      sql`select claimed_at is not null claimed from mailbox where id = ${id.toString()}::bigint`,
    )) as unknown as { claimed: boolean }[];
    expect(m!.claimed).toBe(true);
    const [log] = (await testDb.execute(
      sql`select diamond_granted::text d from mail_claim_logs where mail_id = ${id.toString()}::bigint`,
    )) as unknown as { d: string }[];
    expect(log!.d).toBe('1500');
  });

  it('멱등: 이미 수령한 메일 재수령 → MAIL_NOT_FOUND(이중 지급 방지)', async () => {
    const id = await insertMail({ diamond: 500 });
    await claimMail({ userId: TEST_USER_ID, serverId: SID, mailId: id });
    const afterFirst = await readDiamond();
    await expect(
      claimMail({ userId: TEST_USER_ID, serverId: SID, mailId: id }),
    ).rejects.toBeInstanceOf(MailError);
    expect(await readDiamond()).toBe(afterFirst); // 추가 지급 없음
  });

  it('만료: expires_at 지난 메일은 MAIL_NOT_FOUND', async () => {
    const id = await insertMail({ diamond: 999 }, 'past');
    await expect(
      claimMail({ userId: TEST_USER_ID, serverId: SID, mailId: id }),
    ).rejects.toBeInstanceOf(MailError);
    expect(await readDiamond()).toBe(baselineDiamond); // 미지급
  });

  it('string payload 안전: diamond가 "2000"(문자열)이어도 +2000(문자열 연결 폭증 방지)', async () => {
    const id = await insertMail({ diamond: '2000' });
    const r = await claimMail({ userId: TEST_USER_ID, serverId: SID, mailId: id });
    expect(r.diamond).toBe(2000);
    expect(await readDiamond()).toBe(baselineDiamond + 2000n); // 15002000 같은 폭증 아님
  });

  it('claimAllMail: 미수령 다건 합산 1회 지급 + 전부 claimed', async () => {
    await insertMail({ diamond: 1500 });
    await insertMail({ diamond: 300 });
    const r = await claimAllMail({ userId: TEST_USER_ID, serverId: SID });
    expect(r.diamond).toBe(1800);
    expect(await readDiamond()).toBe(baselineDiamond + 1800n);
    const [{ n }] = (await testDb.execute(sql`
      select count(*)::int n from mailbox
      where user_id = ${TEST_USER_ID}::uuid and sender_label = ${SENDER} and claimed_at is null
    `)) as unknown as { n: number }[];
    expect(n).toBe(0);
  });
});
