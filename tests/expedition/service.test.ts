import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  claimExpedition,
  completeNowExpedition,
  ensureOffers,
  refreshOffer,
  startExpedition,
} from '@/lib/game/expedition/service';
import type { Rng10k } from '@/lib/game/expedition/engine';
import { EXPEDITION_DAILY_STARTS } from '@/lib/game/balance';

import { endTestDb, sql, testDb } from '../db';

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SID = 1;
const uid = TEST_USER_ID;

const seq = (vals: number[]): Rng10k => {
  let i = 0;
  return () => vals[i++] ?? 0;
};
/** 결정론 오퍼: swamp · easy(4h) · 다이아 66(120×0.55). */
const DIA_OFFER_RNG = () => seq([0, 0, 5500, 0]);

/**
 * 파견 DB 통합(스테이징 TEST_USER_ID·tx 스냅샷 복원 원칙) — 상태머신·카운터·지급 정합.
 * 동시성 단정은 "정확히 N건" 형태만(순서 기대 금지 — 배틀패스 테스트 규약 승계).
 */
describe.skipIf(skip)('파견 — DB 통합', () => {
  let avatarId = '';
  let baseDiamond = 0n;
  let baseBoxes: Record<string, string> = {};

  const wipe = async () => {
    await testDb.execute(sql`delete from expeditions where user_id = ${uid}::uuid`);
    await testDb.execute(sql`delete from expedition_state where user_id = ${uid}::uuid`);
  };

  beforeAll(async () => {
    const [av] = (await testDb.execute(sql`
      select id::text from user_profiles where user_id = ${uid}::uuid and server_id = ${SID} limit 1
    `)) as unknown as { id: string }[];
    if (!av) throw new Error('TEST 유저에 user_profiles(아바타) 행이 없음');
    avatarId = av.id;
    const [c] = (await testDb.execute(sql`
      select diamond::text as d from characters where user_id = ${uid}::uuid and server_id = ${SID}
    `)) as unknown as { d: string }[];
    baseDiamond = BigInt(c?.d ?? '0');
    const boxes = (await testDb.execute(sql`
      select slot, count::text from user_supply_boxes where user_id = ${uid}::uuid and server_id = ${SID}
    `)) as unknown as { slot: string; count: string }[];
    baseBoxes = Object.fromEntries(boxes.map((b) => [b.slot, b.count]));
  });

  beforeEach(wipe);

  afterAll(async () => {
    await wipe();
    // 스냅샷 복원 — 다이아·상자·원장 잔재(배틀패스 규약).
    await testDb.execute(sql`
      update characters set diamond = ${baseDiamond} where user_id = ${uid}::uuid and server_id = ${SID}
    `);
    for (const [slot, count] of Object.entries(baseBoxes)) {
      await testDb.execute(sql`
        update user_supply_boxes set count = ${BigInt(count)}
        where user_id = ${uid}::uuid and server_id = ${SID} and slot = ${slot}
      `);
    }
    await testDb.execute(sql`
      delete from user_supply_boxes where user_id = ${uid}::uuid and server_id = ${SID}
        and slot not in ${sql.raw(`('${Object.keys(baseBoxes).join("','") || 'weapon'}')`)}
    `);
    await testDb.execute(sql`
      delete from diamond_ledger where user_id = ${uid}::uuid
        and reason in ('expedition','expedition_refresh','expedition_slot')
    `);
    await endTestDb();
  });

  const offerCount = async () =>
    Number(
      (
        (await testDb.execute(sql`
          select count(*)::int as n from expeditions where user_id = ${uid}::uuid and status = 'offer'
        `)) as unknown as { n: number }[]
      )[0]!.n,
    );

  it('ensureOffers — 신규 상태에서 실효 슬롯(1)만큼 오퍼 생성, 멱등', async () => {
    await ensureOffers(uid, SID, DIA_OFFER_RNG());
    expect(await offerCount()).toBe(1);
    await ensureOffers(uid, SID, DIA_OFFER_RNG());
    expect(await offerCount()).toBe(1); // 멱등 — 활성 행 유지
  });

  it('refresh — 무료 3회 차감 후 유료(잔액 검증), 보상 리롤', async () => {
    await ensureOffers(uid, SID, DIA_OFFER_RNG());
    const r1 = await refreshOffer(uid, SID, 1, DIA_OFFER_RNG());
    expect(r1.freeLeft).toBe(2);
    await refreshOffer(uid, SID, 1, DIA_OFFER_RNG());
    const r3 = await refreshOffer(uid, SID, 1, DIA_OFFER_RNG());
    expect(r3.freeLeft).toBe(0);
    // 4번째 = 유료 — 성공 시 잔액 -20 (테스트 계정 잔액 충분 전제, afterAll 복원)
    const before = BigInt(
      ((await testDb.execute(sql`select diamond::text as d from characters where user_id=${uid}::uuid and server_id=${SID}`)) as unknown as { d: string }[])[0]!.d,
    );
    await refreshOffer(uid, SID, 1, DIA_OFFER_RNG());
    const after = BigInt(
      ((await testDb.execute(sql`select diamond::text as d from characters where user_id=${uid}::uuid and server_id=${SID}`)) as unknown as { d: string }[])[0]!.d,
    );
    expect(before - after).toBe(20n);
  });

  it('시작→미완료 수령 거부→강제 만기→수령(다이아 지급·XP·전이)·이중 수령 차단', async () => {
    await ensureOffers(uid, SID, DIA_OFFER_RNG());
    const s = await startExpedition(uid, SID, 1, avatarId);
    expect(s.finalReward.kind).toBe('dia');
    // 기본 66(120×0.55)에 테스트 계정 아바타의 실제 시너지(가변)가 가산 — 산식 정합으로 단정.
    const expected = Math.max(1, Math.round(66 * (1 + s.synergyBp / 10000)));
    expect(s.finalReward.diamond).toBe(expected);

    await expect(claimExpedition(uid, SID, 1, seq([9999]))).rejects.toMatchObject({ code: 'NOT_READY' });

    // 픽스처 — 서버 시계 우회는 테스트에서만(complete_at 강제 만기).
    await testDb.execute(sql`
      update expeditions set complete_at = now() - interval '1 second'
      where user_id = ${uid}::uuid and status = 'running'
    `);

    const before = BigInt(
      ((await testDb.execute(sql`select diamond::text as d from characters where user_id=${uid}::uuid and server_id=${SID}`)) as unknown as { d: string }[])[0]!.d,
    );
    const c = await claimExpedition(uid, SID, 1, seq([9999])); // no crit
    expect(c.crit).toBe(false);
    expect(c.xpGained).toBe(4);
    const after = BigInt(
      ((await testDb.execute(sql`select diamond::text as d from characters where user_id=${uid}::uuid and server_id=${SID}`)) as unknown as { d: string }[])[0]!.d,
    );
    expect(after - before).toBe(BigInt(c.reward.diamond!));

    await expect(claimExpedition(uid, SID, 1, seq([9999]))).rejects.toMatchObject({ code: 'NOT_RUNNING' });

    const [st] = (await testDb.execute(sql`
      select level, xp::text from expedition_state where user_id = ${uid}::uuid and server_id = ${SID}
    `)) as unknown as { level: number; xp: string }[];
    expect(Number(st!.xp)).toBe(4);
  });

  it('동시 수령 4건 — 정확히 1건만 지급', async () => {
    await ensureOffers(uid, SID, DIA_OFFER_RNG());
    await startExpedition(uid, SID, 1, avatarId);
    await testDb.execute(sql`
      update expeditions set complete_at = now() - interval '1 second'
      where user_id = ${uid}::uuid and status = 'running'
    `);
    const before = BigInt(
      ((await testDb.execute(sql`select diamond::text as d from characters where user_id=${uid}::uuid and server_id=${SID}`)) as unknown as { d: string }[])[0]!.d,
    );
    const results = await Promise.allSettled([
      claimExpedition(uid, SID, 1, seq([9999])),
      claimExpedition(uid, SID, 1, seq([9999])),
      claimExpedition(uid, SID, 1, seq([9999])),
      claimExpedition(uid, SID, 1, seq([9999])),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok.length).toBe(1);
    const paid = (ok[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof claimExpedition>>>).value;
    const after = BigInt(
      ((await testDb.execute(sql`select diamond::text as d from characters where user_id=${uid}::uuid and server_id=${SID}`)) as unknown as { d: string }[])[0]!.d,
    );
    expect(after - before).toBe(BigInt(paid.reward.diamond!)); // 정확 1회 지급
  });

  it('일일 시작 상한 — 6회 소진 시 START_LIMIT', async () => {
    await ensureOffers(uid, SID, DIA_OFFER_RNG());
    await testDb.execute(sql`
      update expedition_state set starts_kst_day = (now() at time zone 'Asia/Seoul')::date,
             starts_today = ${EXPEDITION_DAILY_STARTS}
      where user_id = ${uid}::uuid and server_id = ${SID}
    `);
    await expect(startExpedition(uid, SID, 1, avatarId)).rejects.toMatchObject({ code: 'START_LIMIT' });
  });

  it('아바타 중복 배정 — 두 번째 시작이 AVATAR_BUSY', async () => {
    // 슬롯 2 확보(레벨 픽스처) 후 두 슬롯에 같은 아바타.
    await ensureOffers(uid, SID, DIA_OFFER_RNG());
    await testDb.execute(sql`
      update expedition_state set level = 5 where user_id = ${uid}::uuid and server_id = ${SID}
    `);
    await ensureOffers(uid, SID, DIA_OFFER_RNG());
    expect(await offerCount()).toBe(2);
    await startExpedition(uid, SID, 1, avatarId);
    await expect(startExpedition(uid, SID, 2, avatarId)).rejects.toMatchObject({ code: 'AVATAR_BUSY' });
  });

  it('즉시 완료 — 남은 시간 환산 차감 후 수령 가능', async () => {
    await ensureOffers(uid, SID, DIA_OFFER_RNG());
    await startExpedition(uid, SID, 1, avatarId);
    const { cost } = await completeNowExpedition(uid, SID, 1);
    expect(cost).toBeGreaterThan(0); // 4h ≈ 240💎(1분=1💎)
    const c = await claimExpedition(uid, SID, 1, seq([0])); // crit
    expect(c.crit).toBe(true);
    expect(c.reward.diamond! % 2).toBe(0); // ×2 — 시너지 반영 최종가의 짝수 배
  });
});
