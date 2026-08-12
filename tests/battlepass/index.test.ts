import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  applyBpSegmentPurchase,
  claimFree,
  claimFreeTier,
  claimPremiumTier,
  claimSegment,
  reclaimBpSegment,
} from '@/lib/game/battlepass';
import {
  BP_TIER_STEP,
  bpSegmentIndex,
  bpTierReward,
  type BattlePassType,
} from '@/lib/game/balance';

import { endTestDb, pickUnusedCatalogId, sql, testDb } from '../db';

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;

/**
 * 강화 패스로 고정 — 보상이 **다이아**라 지급/회수가 지갑·diamond_ledger에 그대로 남는다.
 * 초월 패스는 보상이 상자라 회수 기록(refund_clawback)이 원장에 남지 않아 8번 케이스를 못 본다.
 */
const TYPE: BattlePassType = 'enhance';
const STEP = BP_TIER_STEP[TYPE];
/** 이 테스트가 만든 원장 잔재 — 정리·집계 대상 사유(수령 2종 + 환불 회수). */
const BP_REASONS = "('battlepass_free','battlepass_premium','refund_clawback')";

/**
 * 배틀패스 DB 통합 — 수령 5경로·구매·환불 회수의 회귀 방지 (2026-08-12).
 *
 * 진행도(reachedFor)는 계정 최고 도달(user_equipment MAX)에서 파생되고 수령 기록은
 * battlepass_state.free_claimed_tiers / battlepass_segments.premium_claimed_tiers에 남는다.
 * 즉 "무엇을 받을 수 있는가"는 DB 두 곳을 읽어야만 정해지므로 단정은 전부 **실측 도달값에서
 * 파생한 단계**로 만든다(하드코딩하면 계정이 자라는 순간 거짓 통과한다).
 *
 * 동시성 단정은 "정확히 N건"·불변식 형태만 쓴다 — 어느 요청이 state 행 락을 먼저 잡는지는
 * 스케줄에 달렸고, 순서에 기대면 그 자체가 플레이크다.
 *
 * 공유 스테이징 DB — 지갑·원장·배틀패스 행은 afterEach/afterAll에서 기준선으로 되돌린다
 * (증감 계산이 아니라 **스냅샷 복원** — 중간 실패로 계산이 틀어져도 잔재가 남지 않는다).
 */
describe.skipIf(skip)('배틀패스 — DB 통합', () => {
  /** 도달 단계를 만들기 위해 넣은 장비 행(있을 때만). 원래 도달값이 충분하면 null. */
  let fixtureEquipId: bigint | null = null;
  let baselineDiamond = 0n;
  let baselineLedgerId = 0n;
  /** 테스트 시작 시점의 배틀패스 행 — afterAll에서 그대로 되살린다. */
  let snapState: number[] | null = null;
  let snapSegments: { idx: number; tiers: number[] }[] = [];

  /** 실측 도달값에서 파생 — 아래 전 케이스가 이 값들만 쓴다. */
  let reached = 0;
  /** 도달한 최고 마일스톤. */
  let topTier = 0;
  /** 미도달 첫 마일스톤(경계 바로 위). */
  let aboveTier = 0;
  /** topTier가 속한 구간. */
  let segIdx = 0;
  /** 무료 라인에서 지금 받을 수 있는 전 마일스톤. */
  let allTiers: number[] = [];

  beforeAll(async () => {
    baselineDiamond = await readDiamond();
    baselineLedgerId = await ledgerMaxId();
    snapState = await readFreeClaimed();
    snapSegments = await readSegments();

    // 도달 3단계 확보 — 하나뿐이면 "다른 경로 동시 수령"이 (한쪽 성공/한쪽 거절)로만 흘러
    // 이중지급 창을 좁게밖에 못 본다. 이미 충분히 자란 계정이면 실측값을 그대로 쓴다.
    reached = await readMaxEnhance();
    if (reached < STEP * 3) {
      fixtureEquipId = await insertFixtureEquip(STEP * 3);
      reached = await readMaxEnhance();
    }
    topTier = Math.floor(reached / STEP) * STEP;
    aboveTier = topTier + STEP;
    segIdx = bpSegmentIndex(TYPE, topTier);
    allTiers = [];
    for (let l = STEP; l <= topTier; l += STEP) allTiers.push(l);
  });

  afterEach(async () => {
    // 배틀패스 행 전삭제 → 다음 케이스는 항상 "미구매·미수령"에서 시작한다(원래 행은 afterAll 복원).
    await wipeBp();
    await setDiamond(baselineDiamond);
    await deleteLedgerSince(baselineLedgerId);
  });

  afterAll(async () => {
    // 스냅샷 복원 — 이 계정이 원래 갖고 있던 수령/구매 기록을 되살린다.
    if (snapState) {
      await testDb.execute(sql`
        insert into battlepass_state (user_id, server_id, pass_type, free_claimed_tiers)
        values (${TEST_USER_ID}::uuid, ${SERVER_ID}, ${TYPE}::battlepass_type, ${JSON.stringify(snapState)}::jsonb)
        on conflict (user_id, server_id, pass_type) do update set free_claimed_tiers = excluded.free_claimed_tiers`);
    }
    for (const s of snapSegments) {
      await testDb.execute(sql`
        insert into battlepass_segments (user_id, server_id, pass_type, segment_index, premium_claimed_tiers)
        values (${TEST_USER_ID}::uuid, ${SERVER_ID}, ${TYPE}::battlepass_type, ${s.idx}, ${JSON.stringify(s.tiers)}::jsonb)
        on conflict (user_id, server_id, pass_type, segment_index) do update set premium_claimed_tiers = excluded.premium_claimed_tiers`);
    }
    if (fixtureEquipId !== null) {
      await testDb.execute(sql`delete from user_equipment where id = ${fixtureEquipId.toString()}::bigint`);
    }
    await endTestDb();
  });

  // ── 1. 구매 멱등 ────────────────────────────────────────────────────────────

  it('구간 구매 멱등 — 두 번째 호출은 null, 세그먼트 행은 1개', async () => {
    const first = await testDb.transaction((tx) =>
      applyBpSegmentPurchase(tx, TEST_USER_ID, SERVER_ID, TYPE, segIdx),
    );
    const second = await testDb.transaction((tx) =>
      applyBpSegmentPurchase(tx, TEST_USER_ID, SERVER_ID, TYPE, segIdx),
    );

    expect(first).toEqual({ rewardKind: 'diamond' });
    expect(second).toBeNull(); // 재구매 = 해금 없음(결제 재시도가 구간을 두 번 열지 않는다)
    expect(await segmentRowCount()).toBe(1);
    // 해금만 — 보상은 유저가 수동 수령하므로 구매 자체로는 지갑이 움직이지 않는다(환불 가능 상태).
    expect(await readSegmentTiers(segIdx)).toEqual([]);
    expect(await readDiamond()).toBe(baselineDiamond);
  });

  it('구간 구매 동시 2건 — 해금 1건·null 1건, 세그먼트 행은 1개', async () => {
    const rs = await Promise.all([
      testDb.transaction((tx) => applyBpSegmentPurchase(tx, TEST_USER_ID, SERVER_ID, TYPE, segIdx)),
      testDb.transaction((tx) => applyBpSegmentPurchase(tx, TEST_USER_ID, SERVER_ID, TYPE, segIdx)),
    ]);
    expect(rs.filter((r) => r !== null)).toHaveLength(1);
    expect(await segmentRowCount()).toBe(1);
  });

  // ── 2~4. 수령 거부 가드 ─────────────────────────────────────────────────────

  it('미구매 구간 프리미엄 수령 → NOT_PURCHASED', async () => {
    await expect(
      claimPremiumTier(TEST_USER_ID, SERVER_ID, TYPE, segIdx, topTier),
    ).rejects.toMatchObject({ code: 'NOT_PURCHASED' });
    expect(await segmentRowCount()).toBe(0); // 수령 시도가 구간을 만들어내지 않는다
    expect(await readDiamond()).toBe(baselineDiamond);
  });

  it('미도달 단계 수령 → NOTHING_TO_CLAIM (무료·프리미엄 동일)', async () => {
    expect(aboveTier).toBeGreaterThan(reached); // 케이스 전제 — 도달값에서 파생한 경계

    await expect(claimFreeTier(TEST_USER_ID, SERVER_ID, TYPE, aboveTier)).rejects.toMatchObject({
      code: 'NOTHING_TO_CLAIM',
    });

    await testDb.transaction((tx) =>
      applyBpSegmentPurchase(tx, TEST_USER_ID, SERVER_ID, TYPE, bpSegmentIndex(TYPE, aboveTier)),
    );
    await expect(
      claimPremiumTier(TEST_USER_ID, SERVER_ID, TYPE, bpSegmentIndex(TYPE, aboveTier), aboveTier),
    ).rejects.toMatchObject({ code: 'NOTHING_TO_CLAIM' });

    // 거절은 tx 롤백이라 상태 흔적이 없어야 한다 — 무료 state 행은 ensureStateRow가 만들었다가 되감긴다.
    expect(await stateRowCount()).toBe(0);
    expect(await readDiamond()).toBe(baselineDiamond);
  });

  it('마일스톤이 아닌 단계 수령 → NOTHING_TO_CLAIM', async () => {
    // 도달 범위 안이지만 step 배수가 아닌 값(강화 step=10 → topTier-1). 보상은 마일스톤에서만 나온다.
    const notMilestone = topTier - 1;
    expect(notMilestone % STEP).not.toBe(0);
    expect(notMilestone).toBeLessThanOrEqual(reached);

    await expect(claimFreeTier(TEST_USER_ID, SERVER_ID, TYPE, notMilestone)).rejects.toMatchObject({
      code: 'NOTHING_TO_CLAIM',
    });
    expect(await stateRowCount()).toBe(0);
    expect(await readDiamond()).toBe(baselineDiamond);
  });

  // ── 5. claimSegment 인덱스 검증(경제 붕괴 회귀 방어) ────────────────────────

  /**
   * 음수/비정수 segmentIndex 차단 — 음수면 startLevel<1이 되고 level<1은 bpSegmentIndex에서
   * 구간0으로 매핑돼 **존재하지 않는 단계의 무료 보상이 무한 발급**된다(경제 붕괴).
   * 가드가 트랜잭션 **밖**에 있어 호출이 동기 throw라 async 래퍼로 받는다.
   */
  it('claimSegment 음수·비정수 segmentIndex → NOTHING_TO_CLAIM (지급 0)', async () => {
    for (const bad of [-1, -0.5, 0.5, segIdx + 0.5, Number.NaN]) {
      await expect(async () =>
        claimSegment(TEST_USER_ID, SERVER_ID, TYPE, bad),
      ).rejects.toMatchObject({ code: 'NOTHING_TO_CLAIM' });
    }
    // 트랜잭션에 진입조차 하지 않았다는 증거 — state 행도, 지급도 없다.
    expect(await stateRowCount()).toBe(0);
    expect(await readDiamond()).toBe(baselineDiamond);
    expect(await ledgerSince(baselineLedgerId)).toHaveLength(0);
  });

  // ── 6~7. 동시 수령 ──────────────────────────────────────────────────────────

  it('같은 단계 동시 수령(claimFreeTier ×4) — 정확히 1건만 지급', async () => {
    const reward = bpTierReward(TYPE, topTier, false);
    // state 행을 미리 만들어 둔다 — 행이 없으면 ensureStateRow의 INSERT 경합이 먼저 직렬화해
    // 정작 검증하려는 SELECT FOR UPDATE를 지나칠 수 있다(=이미 수령 이력이 있는 계정의 실제 경로).
    await seedStateRow([]);

    const rs = await Promise.allSettled(
      Array.from({ length: 4 }, () => claimFreeTier(TEST_USER_ID, SERVER_ID, TYPE, topTier)),
    );
    const ok = fulfilled(rs);
    expect(ok).toHaveLength(1);
    for (const v of ok) expect(v).toEqual({ granted: reward, rewardKind: 'diamond' });
    for (const r of rs) if (r.status === 'rejected') expect(errCode(r)).toBe('NOTHING_TO_CLAIM');

    // 기록도 1건 — 집합에 같은 단계가 두 번 들어가면 이후 수령 판정이 통째로 흔들린다.
    expect(await readFreeClaimed()).toEqual([topTier]);
    // 지갑·원장 둘 다로 판정 — 한쪽만 보면 보정 누락(지급했는데 기록 없음)을 놓친다.
    expect(await readDiamond()).toBe(baselineDiamond + BigInt(reward));
    const led = await ledgerSince(baselineLedgerId);
    expect(led).toHaveLength(1);
    expect(led[0]).toMatchObject({ reason: 'battlepass_free', delta: BigInt(reward) });
  });

  it('서로 다른 경로 동시 수령(claimFreeTier + claimFree) — 이중 지급 없음', async () => {
    // 두 경로가 같은 state 행을 잠그는지가 이 케이스로 증명된다 — 락이 갈리면 둘 다
    // claimed=∅을 읽어 topTier 보상이 두 번 나간다.
    const expectedTotal = allTiers.reduce((s, l) => s + bpTierReward(TYPE, l, false), 0);
    await seedStateRow([]); // 위와 같은 이유 — 락이 유일한 방어가 되도록 행을 미리 만든다.

    const rs = await Promise.allSettled([
      claimFreeTier(TEST_USER_ID, SERVER_ID, TYPE, topTier),
      claimFree(TEST_USER_ID, SERVER_ID, TYPE),
    ]);
    const ok = fulfilled(rs);
    expect(ok.length).toBeGreaterThanOrEqual(1); // 승자는 스케줄에 달렸다 — 개수만 본다
    for (const r of rs) if (r.status === 'rejected') expect(errCode(r)).toBe('NOTHING_TO_CLAIM');

    // 어느 순서든 두 경로가 합쳐 **전 마일스톤을 정확히 한 번씩** 수령한 상태여야 한다.
    expect(await readFreeClaimed()).toEqual(allTiers);
    expect(ok.reduce((s, v) => s + v.granted, 0)).toBe(expectedTotal);
    expect(await readDiamond()).toBe(baselineDiamond + BigInt(expectedTotal));

    const led = await ledgerSince(baselineLedgerId);
    expect(led).toHaveLength(ok.length); // 수령 1건 = 원장 1행
    expect(led.reduce((s, r) => s + r.delta, 0n)).toBe(BigInt(expectedTotal));
  });

  // ── 8. 환불 회수 ────────────────────────────────────────────────────────────

  it('환불 회수 — 구간 행 삭제 + 수령분만 회수 + refund_clawback 기록', async () => {
    const reward = bpTierReward(TYPE, topTier, true);
    const ref = `order:test-bp-${process.pid}`;

    await testDb.transaction((tx) =>
      applyBpSegmentPurchase(tx, TEST_USER_ID, SERVER_ID, TYPE, segIdx),
    );
    const claimed = await claimPremiumTier(TEST_USER_ID, SERVER_ID, TYPE, segIdx, topTier);
    expect(claimed).toEqual({ granted: reward, rewardKind: 'diamond' });
    expect(await readSegmentTiers(segIdx)).toEqual([topTier]);
    expect(await readDiamond()).toBe(baselineDiamond + BigInt(reward));

    await testDb.transaction((tx) =>
      reclaimBpSegment(tx, TEST_USER_ID, SERVER_ID, TYPE, segIdx, ref),
    );

    expect(await segmentRowCount()).toBe(0); // 재잠금(재구매 가능)
    // 회수액은 **수령한 단계 보상만** — 구간 전체를 회수하면 안 받은 몫까지 빼앗는다.
    expect(await readDiamond()).toBe(baselineDiamond);
    const led = await ledgerSince(baselineLedgerId);
    expect(led).toHaveLength(2);
    expect(led[0]).toMatchObject({ reason: 'battlepass_premium', delta: BigInt(reward) });
    // 환불 분쟁 조사에 필요한 유일한 기록 — 회수(−)가 원장에 남지 않으면 지급만 보인다.
    expect(led[1]).toMatchObject({ reason: 'refund_clawback', delta: -BigInt(reward), ref });
  });

  it('미수령 구간 환불 회수 — 행만 삭제, 지갑·원장 무변동', async () => {
    await testDb.transaction((tx) =>
      applyBpSegmentPurchase(tx, TEST_USER_ID, SERVER_ID, TYPE, segIdx),
    );
    await testDb.transaction((tx) =>
      reclaimBpSegment(tx, TEST_USER_ID, SERVER_ID, TYPE, segIdx, 'order:test-bp-unclaimed'),
    );

    expect(await segmentRowCount()).toBe(0);
    expect(await readDiamond()).toBe(baselineDiamond);
    expect(await ledgerSince(baselineLedgerId)).toHaveLength(0);
  });

  // ── 헬퍼 ────────────────────────────────────────────────────────────────────

  function fulfilled<T>(rs: PromiseSettledResult<T>[]): T[] {
    return rs.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  }

  /** 거절 사유 — BattlePassErr면 그 code. drizzle이 드라이버 에러를 감싸는 경우 cause를 따라간다. */
  function errCode(r: PromiseSettledResult<unknown>): string {
    if (r.status !== 'rejected') return '';
    let e: unknown = r.reason;
    for (let i = 0; e != null && i < 5; i += 1) {
      const o = e as { code?: string; cause?: unknown };
      if (typeof o.code === 'string') return o.code;
      e = o.cause;
    }
    return String((r.reason as Error)?.message ?? r.reason);
  }

  async function readMaxEnhance(): Promise<number> {
    const r = (await testDb.execute(sql`
      select coalesce(max(max_enhance_level), 0)::int m from user_equipment
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`)) as unknown as {
      m: number;
    }[];
    return Number(r[0]!.m);
  }

  /** 도달 단계 픽스처 — 배틀패스 진행도는 user_equipment MAX에서만 파생되므로 이 방법뿐이다. */
  async function insertFixtureEquip(maxLevel: number): Promise<bigint> {
    const catalogItemId = await pickUnusedCatalogId(TEST_USER_ID);
    const r = (await testDb.execute(sql`
      insert into user_equipment
        (user_id, server_id, catalog_item_id, enhance_level, max_enhance_level)
      values (${TEST_USER_ID}::uuid, ${SERVER_ID}, ${catalogItemId}, ${maxLevel}, ${maxLevel})
      returning id::text id`)) as unknown as { id: string }[];
    return BigInt(r[0]!.id);
  }

  async function readDiamond(): Promise<bigint> {
    const r = (await testDb.execute(sql`
      select diamond::text d from characters
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`)) as unknown as {
      d: string;
    }[];
    return BigInt(r[0]?.d ?? '0');
  }

  /** 기준선 하드 복원 — 증감 누계가 아니라 스냅샷으로 되돌린다(중간 실패에도 잔재 0). */
  async function setDiamond(v: bigint): Promise<void> {
    await testDb.execute(sql`
      update characters set diamond = ${v.toString()}::bigint
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`);
  }

  async function ledgerMaxId(): Promise<bigint> {
    const r = (await testDb.execute(sql`
      select coalesce(max(id), 0)::text m from diamond_ledger
      where user_id = ${TEST_USER_ID}::uuid`)) as unknown as { m: string }[];
    return BigInt(r[0]!.m);
  }

  async function ledgerSince(
    fromId: bigint,
  ): Promise<{ reason: string; delta: bigint; ref: string | null }[]> {
    const r = (await testDb.execute(sql`
      select reason::text reason, delta::text delta, ref from diamond_ledger
      where user_id = ${TEST_USER_ID}::uuid and id > ${fromId.toString()}::bigint
        and reason in ${sql.raw(BP_REASONS)}
      order by id`)) as unknown as { reason: string; delta: string; ref: string | null }[];
    return r.map((x) => ({ reason: x.reason, delta: BigInt(x.delta), ref: x.ref }));
  }

  async function deleteLedgerSince(fromId: bigint): Promise<void> {
    await testDb.execute(sql`
      delete from diamond_ledger
      where user_id = ${TEST_USER_ID}::uuid and id > ${fromId.toString()}::bigint
        and reason in ${sql.raw(BP_REASONS)}`);
  }

  /** 무료 수령 집합 — 행이 없으면 null(수령 이력 자체가 없는 상태). */
  async function readFreeClaimed(): Promise<number[] | null> {
    const r = (await testDb.execute(sql`
      select free_claimed_tiers t from battlepass_state
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
        and pass_type = ${TYPE}::battlepass_type`)) as unknown as { t: number[] }[];
    return r[0] ? r[0].t : null;
  }

  /** 수령 이력 있는 계정 재현 — 동시 수령 케이스에서 state 행을 선행 생성한다. */
  async function seedStateRow(tiers: number[]): Promise<void> {
    await testDb.execute(sql`
      insert into battlepass_state (user_id, server_id, pass_type, free_claimed_tiers)
      values (${TEST_USER_ID}::uuid, ${SERVER_ID}, ${TYPE}::battlepass_type, ${JSON.stringify(tiers)}::jsonb)
      on conflict (user_id, server_id, pass_type) do update set free_claimed_tiers = excluded.free_claimed_tiers`);
  }

  async function stateRowCount(): Promise<number> {
    const r = (await testDb.execute(sql`
      select count(*)::int n from battlepass_state
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
        and pass_type = ${TYPE}::battlepass_type`)) as unknown as { n: number }[];
    return Number(r[0]!.n);
  }

  async function readSegments(): Promise<{ idx: number; tiers: number[] }[]> {
    const r = (await testDb.execute(sql`
      select segment_index idx, premium_claimed_tiers t from battlepass_segments
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
        and pass_type = ${TYPE}::battlepass_type
      order by segment_index`)) as unknown as { idx: number; t: number[] }[];
    return r.map((x) => ({ idx: Number(x.idx), tiers: x.t }));
  }

  async function readSegmentTiers(idx: number): Promise<number[] | null> {
    const rows = await readSegments();
    return rows.find((s) => s.idx === idx)?.tiers ?? null;
  }

  async function segmentRowCount(): Promise<number> {
    return (await readSegments()).length;
  }

  async function wipeBp(): Promise<void> {
    await testDb.execute(sql`
      delete from battlepass_segments
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
        and pass_type = ${TYPE}::battlepass_type`);
    await testDb.execute(sql`
      delete from battlepass_state
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}
        and pass_type = ${TYPE}::battlepass_type`);
  }
});
