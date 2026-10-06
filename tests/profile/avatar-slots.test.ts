import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PROFILE_BASE_SLOTS, PROFILE_MAX, PROFILE_SLOT_COST_DIAMOND, profileSlotLimit } from '@/lib/game/balance';
import { expandAvatarSlots } from '@/lib/game/profile/slots';

import { endTestDb, sql, testDb } from '../db';

describe('아바타 보관함 한도(순수)', () => {
  it('기본 100칸 + 늘린 칸, 최대 200칸', () => {
    expect(profileSlotLimit(0)).toBe(PROFILE_BASE_SLOTS);
    expect(profileSlotLimit(30)).toBe(130);
    expect(profileSlotLimit(500)).toBe(PROFILE_MAX);
    expect(profileSlotLimit(-5)).toBe(PROFILE_BASE_SLOTS);
  });
});

const U = process.env.TEST_USER_ID ?? '';
const S = 1;
let n = 0;
const key = () => `slottest${process.pid}x${Date.now() % 1e8}k${++n}`;

describe.skipIf(!U)('아바타 보관함 늘리기 — DB 통합(스테이징 테스트 계정)', () => {
  let base: { bonus: number; dia: string };
  beforeEach(async () => {
    const [c] = (await testDb.execute(sql`select avatar_slot_bonus as bonus, diamond::text as dia from characters where user_id=${U}::uuid and server_id=${S}`)) as unknown as { bonus: number; dia: string }[];
    base = { bonus: Number(c!.bonus), dia: c!.dia };
  });
  afterEach(async () => {
    await testDb.execute(sql`update characters set avatar_slot_bonus=${base.bonus}, diamond=${base.dia}::bigint where user_id=${U}::uuid and server_id=${S}`);
    await testDb.execute(sql`delete from diamond_ledger where user_id=${U}::uuid and reason='avatar_slot' and created_at > now() - interval '5 minutes'`);
  });
  afterAll(async () => {
    await endTestDb();
  });

  it('💎1,000에 10칸, 다이아·칸이 함께 바뀐다', async () => {
    await testDb.execute(sql`update characters set avatar_slot_bonus=0, diamond=2500 where user_id=${U}::uuid and server_id=${S}`);
    expect(await expandAvatarSlots(U, S, key())).toEqual({ limit: 110, duplicate: false, diamondBalance: String(2500 - PROFILE_SLOT_COST_DIAMOND) });
    const [c] = (await testDb.execute(sql`select avatar_slot_bonus as b, diamond::int as d from characters where user_id=${U}::uuid and server_id=${S}`)) as unknown as { b: number; d: number }[];
    expect(c).toEqual({ b: 10, d: 2500 - PROFILE_SLOT_COST_DIAMOND });
  });

  it('다이아가 모자라면 칸도 그대로', async () => {
    await testDb.execute(sql`update characters set avatar_slot_bonus=0, diamond=999 where user_id=${U}::uuid and server_id=${S}`);
    await expect(expandAvatarSlots(U, S, key())).rejects.toMatchObject({ code: 'INSUFFICIENT_DIAMOND' });
    const [c] = (await testDb.execute(sql`select avatar_slot_bonus as b from characters where user_id=${U}::uuid and server_id=${S}`)) as unknown as { b: number }[];
    expect(c?.b).toBe(0);
  });

  it('같은 요청 키로 다시 와도 한 번만 산다(응답 유실 재전송)', async () => {
    await testDb.execute(sql`update characters set avatar_slot_bonus=0, diamond=5000 where user_id=${U}::uuid and server_id=${S}`);
    const k = key();
    const rs = await Promise.all([expandAvatarSlots(U, S, k), expandAvatarSlots(U, S, k)]);
    expect(rs.filter((r) => r.duplicate).length).toBe(1);
    const [c] = (await testDb.execute(sql`select avatar_slot_bonus as b, diamond::int as d from characters where user_id=${U}::uuid and server_id=${S}`)) as unknown as { b: number; d: number }[];
    expect(c).toEqual({ b: 10, d: 5000 - PROFILE_SLOT_COST_DIAMOND });
  });

  it('10의 배수가 아닌 옛 값도 200에 맞춰 채운다', async () => {
    await testDb.execute(sql`update characters set avatar_slot_bonus=93, diamond=5000 where user_id=${U}::uuid and server_id=${S}`);
    expect((await expandAvatarSlots(U, S, key())).limit).toBe(PROFILE_MAX);
    await expect(expandAvatarSlots(U, S, key())).rejects.toMatchObject({ code: 'SLOT_MAX' });
  });

  it('최대 200칸을 넘지 않는다(동시 요청 포함)', async () => {
    await testDb.execute(sql`update characters set avatar_slot_bonus=90, diamond=5000 where user_id=${U}::uuid and server_id=${S}`);
    const rs = await Promise.allSettled([expandAvatarSlots(U, S, key()), expandAvatarSlots(U, S, key()), expandAvatarSlots(U, S, key())]);
    expect(rs.filter((r) => r.status === 'fulfilled').length).toBe(1);
    const [c] = (await testDb.execute(sql`select avatar_slot_bonus as b, diamond::int as d from characters where user_id=${U}::uuid and server_id=${S}`)) as unknown as { b: number; d: number }[];
    expect(c).toEqual({ b: 100, d: 5000 - PROFILE_SLOT_COST_DIAMOND });
  });
});
