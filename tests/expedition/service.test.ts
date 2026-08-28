import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  claimExpedition,
  ensureOffers,
  refreshOffer,
  startExpedition,
} from '@/lib/game/expedition/service';
import type { Rng10k } from '@/lib/game/expedition/engine';

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

  /**
   * 합산 강화 픽스처(2026-08-28 슬롯 개편) — 슬롯은 user_equipment enhance_level 합으로만 열린다.
   * 테스트 유저 장비 첫 행에 원하는 합을 싣고 나머지는 0, afterAll에서 원복.
   */
  let baseLevels: { id: string; lv: number }[] = [];
  const setEnhanceSum = async (sum: number) => {
    if (baseLevels.length === 0) {
      baseLevels = (await testDb.execute(sql`
        select id::text, enhance_level as lv from user_equipment where user_id = ${uid}::uuid and server_id = ${SID} order by id
      `)) as unknown as { id: string; lv: number }[];
      if (baseLevels.length === 0) throw new Error('TEST 유저에 user_equipment 행이 없음(합산 강화 픽스처 불가)');
    }
    await testDb.execute(sql`update user_equipment set enhance_level = 0 where user_id = ${uid}::uuid and server_id = ${SID}`);
    await testDb.execute(sql`update user_equipment set enhance_level = ${sum} where id = ${BigInt(baseLevels[0]!.id)}`);
  };
  beforeEach(async () => {
    await wipe();
    await setEnhanceSum(1000); // 기본: 슬롯 1칸
  });

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
    for (const b of baseLevels) {
      await testDb.execute(sql`update user_equipment set enhance_level = ${b.lv} where id = ${BigInt(b.id)}`);
    }
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
    // 기본 40(72×0.55, 2026-08-27 ×0.6)에 테스트 계정 아바타의 실제 시너지(가변)가 가산 — 산식 정합으로 단정.
    const expected = Math.max(1, Math.round(40 * (1 + s.synergyBp / 10000)));
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

  it('슬롯 해금 — 합산 강화 미달이면 오퍼 0·시작 SLOT_LOCKED, 1k/3k에서 1·2칸', async () => {
    await setEnhanceSum(999);
    await ensureOffers(uid, SID, DIA_OFFER_RNG());
    expect(await offerCount()).toBe(0);
    await expect(startExpedition(uid, SID, 1, avatarId)).rejects.toMatchObject({ code: 'SLOT_LOCKED' });
    await setEnhanceSum(1000);
    await ensureOffers(uid, SID, DIA_OFFER_RNG());
    expect(await offerCount()).toBe(1);
    await setEnhanceSum(3000);
    await ensureOffers(uid, SID, DIA_OFFER_RNG());
    expect(await offerCount()).toBe(2);
  });

  it('합산 강화 하락 — 진행 중 파견은 유지되고 새 배정만 잠긴다', async () => {
    await setEnhanceSum(5000);
    await ensureOffers(uid, SID, DIA_OFFER_RNG());
    await startExpedition(uid, SID, 2, avatarId);
    await setEnhanceSum(0);
    await ensureOffers(uid, SID, DIA_OFFER_RNG()); // 닫힌 슬롯의 running은 건드리지 않는다
    const [r] = (await testDb.execute(sql`
      select status from expeditions where user_id = ${uid}::uuid and slot = 2
    `)) as unknown as { status: string }[];
    expect(r?.status).toBe('running');
    await expect(startExpedition(uid, SID, 1, avatarId)).rejects.toMatchObject({ code: 'SLOT_LOCKED' });
  });

  it('아바타 중복 배정 — 두 번째 시작이 AVATAR_BUSY', async () => {
    // 슬롯 2 확보(합산 강화 5,000 픽스처) 후 두 슬롯에 같은 아바타.
    await setEnhanceSum(5000);
    await ensureOffers(uid, SID, DIA_OFFER_RNG());
    expect(await offerCount()).toBe(2);
    await startExpedition(uid, SID, 1, avatarId);
    await expect(startExpedition(uid, SID, 2, avatarId)).rejects.toMatchObject({ code: 'AVATAR_BUSY' });
  });

});
