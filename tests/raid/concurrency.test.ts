import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

// 정산의 외부 부작용만 mock — 푸시·리더보드 증분은 이 테스트의 관심사가 아니고, 리더보드는
// 랭크·마일스톤 우편까지 건드려 공유 DB에 되돌리기 어려운 잔재를 남긴다(settle.test.ts와 동일).
vi.mock('@/lib/push/send', () => ({ sendPushToUsers: vi.fn(async () => {}) }));
vi.mock('@/lib/game/leaderboard/incremental', () => ({ bumpCountMetric: vi.fn(async () => {}) }));

import { attackRaid, buyExtraAttack, gemAttackRaid } from '@/lib/game/raid/attack';
import { settleRaid } from '@/lib/game/raid/settle';
import { RAID_BASE_ATTACKS, raidExtraAttackCost } from '@/lib/game/balance';
import { raidPhasesCleared } from '@/lib/game/raid/drops';

import { endTestDb, sql, testDb } from '../db';

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const skip = !TEST_USER_ID;
const SERVER_ID = 1;

/**
 * 레이드 동시성 가드 DB 통합 — 락(`for update`)으로만 막는 구간의 회귀 방지 (2026-08-12).
 *
 * attackRaid·buyExtraAttack·gemAttackRaid는 raids 행 → raid_participants 행 순서로 잠그고
 * 상태·만료를 **락 안에서 재확인**한다. settleRaid는 같은 raids 행을 잠그고 `status='active'
 * AND expire_at<=now()` 조건부로 전이한다. 즉 공격과 정산은 같은 행 락 하나로 직렬화되며,
 * 이 파일은 그 직렬화가 깨졌을 때만 나오는 결과(횟수 초과·이중 과금·데미지 누락 정산)를 잡는다.
 *
 * 단정은 전부 **"정확히 N건"·불변식** 형태다 — 어느 요청이 먼저 락을 잡는지는 스케줄에 달렸으므로
 * 순서에 기대면 그 자체가 플레이크다.
 *
 * 공유 스테이징 DB — 만든 행(보상·로그·참가자·레이드)은 afterEach에서 생성 역순으로 정리한다.
 * 픽스처는 raids를 직접 INSERT하므로 openRaid를 타지 않는다 = raid_daily_counts는 건드리지 않는다.
 */
describe.skipIf(skip)('레이드 동시성 가드 — DB 통합', () => {
  /** 만든 레이드별 정리 함수(생성 순). afterEach가 역순으로 실행. */
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const c of [...cleanups].reverse()) {
      try {
        await c();
      } catch {}
    }
    cleanups.length = 0;
  });

  afterAll(async () => {
    await endTestDb();
  });

  // ── 픽스처 ──────────────────────────────────────────────────────────────────

  /** phase1_hp 기본값 — 데미지(총전투력 기준 수십)로는 못 넘겨 phases_cleared를 0으로 고정. */
  const HP_UNREACHABLE = 8000;
  /** 만료 레이스용 — 공격 1회로 1페이즈 이상 돌파해 "데미지가 정산에 반영됐는지"가 눈에 보인다. */
  const HP_TINY = 5;

  async function makeRaid(opts: {
    attacksUsed?: number;
    extraAttacks?: number;
    phase1Hp?: number;
    /** 미지정 시 1시간 뒤. 만료 경계 테스트는 여기에 직접 시각을 박는다. */
    expireAt?: Date;
  }): Promise<bigint> {
    const expireAt = opts.expireAt ?? new Date(Date.now() + 3_600_000);
    const shareCode = `cc-raid-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const r = (await testDb.execute(sql`
      insert into raids (server_id, host_user_id, boss_code, phase1_hp, share_code, expire_at, status)
      values (${SERVER_ID}, ${TEST_USER_ID}::uuid, 'slime_king'::raid_boss,
              ${String(opts.phase1Hp ?? HP_UNREACHABLE)}::bigint, ${shareCode},
              ${expireAt.toISOString()}::timestamptz, 'active')
      returning id::text id`)) as unknown as { id: string }[];
    const raidId = BigInt(r[0]!.id);
    await testDb.execute(sql`
      insert into raid_participants (raid_id, user_id, attacks_used, extra_attacks, total_damage)
      values (${raidId.toString()}::bigint, ${TEST_USER_ID}::uuid,
              ${opts.attacksUsed ?? 0}, ${opts.extraAttacks ?? 0}, 0)`);

    const rid = raidId.toString();
    cleanups.push(async () => {
      // 생성 역순 — 보상 → 로그 → 참가자 → 레이드. raid_attacks는 FK가 없어 cascade에 못 맡긴다.
      try { await testDb.execute(sql`delete from raid_rewards where raid_id = ${rid}::bigint`); } catch {}
      try { await testDb.execute(sql`delete from raid_attacks where raid_id = ${rid}::bigint`); } catch {}
      try { await testDb.execute(sql`delete from raid_participants where raid_id = ${rid}::bigint`); } catch {}
      try { await testDb.execute(sql`delete from raids where id = ${rid}::bigint`); } catch {}
    });
    return raidId;
  }

  // ── 조회 헬퍼 ───────────────────────────────────────────────────────────────

  async function readPart(raidId: bigint): Promise<{
    attacksUsed: number;
    extraAttacks: number;
    totalDamage: bigint;
    lastBuyKey: string | null;
  }> {
    const r = (await testDb.execute(sql`
      select attacks_used au, extra_attacks ea, total_damage::text td, last_buy_key::text lk
      from raid_participants
      where raid_id = ${raidId.toString()}::bigint and user_id = ${TEST_USER_ID}::uuid`)) as unknown as {
      au: number;
      ea: number;
      td: string;
      lk: string | null;
    }[];
    return {
      attacksUsed: Number(r[0]!.au),
      extraAttacks: Number(r[0]!.ea),
      totalDamage: BigInt(r[0]!.td),
      lastBuyKey: r[0]!.lk,
    };
  }

  async function attackRowCount(raidId: bigint): Promise<number> {
    const r = (await testDb.execute(sql`
      select count(*)::int n from raid_attacks where raid_id = ${raidId.toString()}::bigint`)) as unknown as {
      n: number;
    }[];
    return r[0]!.n;
  }

  async function attackRowCountByKey(idemKey: string): Promise<number> {
    const r = (await testDb.execute(sql`
      select count(*)::int n from raid_attacks where idempotency_key = ${idemKey}::uuid`)) as unknown as {
      n: number;
    }[];
    return r[0]!.n;
  }

  async function rewardCount(raidId: bigint): Promise<number> {
    const r = (await testDb.execute(sql`
      select count(*)::int n from raid_rewards where raid_id = ${raidId.toString()}::bigint`)) as unknown as {
      n: number;
    }[];
    return r[0]!.n;
  }

  async function raidRow(raidId: bigint): Promise<{ status: string; phasesCleared: number }> {
    const r = (await testDb.execute(sql`
      select status::text s, phases_cleared pc from raids where id = ${raidId.toString()}::bigint`)) as unknown as {
      s: string;
      pc: number;
    }[];
    return { status: r[0]!.s, phasesCleared: Number(r[0]!.pc) };
  }

  async function readDiamond(): Promise<bigint> {
    const r = (await testDb.execute(sql`
      select diamond::text d from characters
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`)) as unknown as { d: string }[];
    return BigInt(r[0]?.d ?? '0');
  }

  /** 잔액 보정 전용(원장 미기록) — 대응하는 원장 행은 deleteLedgerSince가 함께 지운다. */
  async function addDiamond(delta: bigint): Promise<void> {
    if (delta === 0n) return;
    await testDb.execute(sql`
      update characters set diamond = diamond + ${delta.toString()}::bigint
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`);
  }

  async function ledgerMaxId(): Promise<bigint> {
    const r = (await testDb.execute(sql`
      select coalesce(max(id), 0)::text m from diamond_ledger
      where user_id = ${TEST_USER_ID}::uuid`)) as unknown as { m: string }[];
    return BigInt(r[0]!.m);
  }

  /** fromId 이후 쌓인 raid_extra_attack 원장 — 이중 과금은 여기서 2건으로 드러난다. */
  async function ledgerSince(fromId: bigint): Promise<{ count: number; sum: bigint }> {
    const r = (await testDb.execute(sql`
      select count(*)::int n, coalesce(sum(delta), 0)::text s from diamond_ledger
      where user_id = ${TEST_USER_ID}::uuid and id > ${fromId.toString()}::bigint
        and reason = 'raid_extra_attack'`)) as unknown as { n: number; s: string }[];
    return { count: r[0]!.n, sum: BigInt(r[0]!.s) };
  }

  async function deleteLedgerSince(fromId: bigint): Promise<void> {
    await testDb.execute(sql`
      delete from diamond_ledger
      where user_id = ${TEST_USER_ID}::uuid and id > ${fromId.toString()}::bigint
        and reason = 'raid_extra_attack'`);
  }

  // ── 결과 헬퍼 ───────────────────────────────────────────────────────────────

  function fulfilled<T>(rs: PromiseSettledResult<T>[]): T[] {
    return rs.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  }

  /**
   * 거절 사유 — RaidError면 그 code. drizzle 0.45가 드라이버 에러를 감싸는 경우가 있어
   * cause 체인을 따라가며 code를 찾는다.
   */
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

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  type AttackResult = Awaited<ReturnType<typeof attackRaid>>;
  type SettleResult = Awaited<ReturnType<typeof settleRaid>>;

  /**
   * 정산↔공격 공통 불변식 — 누가 이기든 성립해야 하는 것만 본다.
   * 핵심: **성공한 공격의 데미지가 빠진 정산은 없다**(rewarded·phases_cleared로 관측).
   */
  async function expectNoContradiction(
    raidId: bigint,
    phase1Hp: number,
    s: PromiseSettledResult<SettleResult>,
    a: PromiseSettledResult<AttackResult>,
  ): Promise<void> {
    expect(s.status).toBe('fulfilled'); // settleRaid는 멱등 no-op이라 throw 경로가 없다
    const st = s.status === 'fulfilled' ? s.value : null;
    if (!st) return;

    const atk = a.status === 'fulfilled' ? a.value : null;
    // 활성·참여자·횟수 여유가 있는 픽스처라, 공격이 실패했다면 이유는 만료/정산뿐이다.
    if (!atk) expect(errCode(a)).toBe('RAID_CLOSED');

    const part = await readPart(raidId);
    expect(part.attacksUsed).toBe(atk ? 1 : 0);
    expect(part.totalDamage).toBe(BigInt(atk?.damage ?? 0));
    expect(await attackRowCount(raidId)).toBe(atk ? 1 : 0);

    const raid = await raidRow(raidId);
    if (st.settled) {
      expect(raid.status).toBe('settled');
      // 공격이 성공했다면 그 시점 누적에 데미지가 들어가 있어야 한다 — 정산이 공격 커밋 전
      // 스냅샷을 읽었다면 rewarded=0(attacks_used=0)·phases=0으로 어긋난다.
      expect(st.rewarded).toBe(atk ? 1 : 0);
      expect(st.phasesCleared).toBe(raidPhasesCleared(phase1Hp, atk?.damage ?? 0));
      expect(raid.phasesCleared).toBe(st.phasesCleared);
      expect(await rewardCount(raidId)).toBe(atk ? 1 : 0);
    } else {
      // 정산이 안 걸렸다면 레이드는 그대로 진행 중 — 보상이 생겼다면 조건부 전이가 뚫린 것.
      expect(raid.status).toBe('active');
      expect(await rewardCount(raidId)).toBe(0);
    }
  }

  // ── 1. 동시 공격 ────────────────────────────────────────────────────────────

  it('동시 공격 — 남은 1회: 정확히 1건만 성공, 나머지는 NO_ATTACKS', async () => {
    const raidId = await makeRaid({ attacksUsed: RAID_BASE_ATTACKS - 1 });

    const rs = await Promise.allSettled(
      Array.from({ length: 4 }, () => attackRaid({ userId: TEST_USER_ID, raidId })),
    );
    const ok = fulfilled(rs);
    expect(ok).toHaveLength(1);
    for (const r of rs) if (r.status === 'rejected') expect(errCode(r)).toBe('NO_ATTACKS');

    const part = await readPart(raidId);
    // allowed = 기본 + 추가. 초과하면 락 없이 읽은 attacks_used로 덮어썼다는 뜻.
    expect(part.attacksUsed).toBeLessThanOrEqual(RAID_BASE_ATTACKS + part.extraAttacks);
    expect(part.attacksUsed).toBe(RAID_BASE_ATTACKS);
    expect(part.totalDamage).toBe(BigInt(ok[0]!.damage)); // 성공한 1건만 누적
    expect(await attackRowCount(raidId)).toBe(ok.length); // 로그 행 = 성공 수
  });

  // ── 2. buyExtraAttack 멱등 ─────────────────────────────────────────────────

  it('buyExtraAttack 동시 같은 idemKey: 다이아 1회분만 차감·응답 동일', async () => {
    const raidId = await makeRaid({});
    const idemKey = crypto.randomUUID();
    const cost = raidExtraAttackCost(1);

    const before0 = await readDiamond();
    // 잔액이 모자란 계정에서도 돌도록 필요한 만큼만 채우고 finally에서 원복(영구 변동 0).
    const toppedUp = before0 < BigInt(cost) ? BigInt(cost) - before0 : 0n;
    await addDiamond(toppedUp);
    const before = before0 + toppedUp;
    const ledgerFrom = await ledgerMaxId();

    try {
      const rs = await Promise.allSettled(
        Array.from({ length: 4 }, () =>
          buyExtraAttack({ userId: TEST_USER_ID, serverId: SERVER_ID, raidId, idemKey }),
        ),
      );
      const ok = fulfilled(rs);
      expect(ok).toHaveLength(4); // 멱등 복원이라 진 쪽도 성공 응답
      for (const v of ok) expect(v).toEqual({ cost, extraAttacks: 1 });

      const part = await readPart(raidId);
      expect(part.extraAttacks).toBe(1); // 4번 눌러도 1회분
      expect(part.lastBuyKey).toBe(idemKey);

      // 이중 과금 판정은 잔액 실측 + 원장 건수 둘 다로 — 한쪽만 보면 보정 누락을 놓친다.
      expect(await readDiamond()).toBe(before - BigInt(cost));
      const led = await ledgerSince(ledgerFrom);
      expect(led.count).toBe(1);
      expect(led.sum).toBe(-BigInt(cost));

      // 구매는 공격이 아니다 — 로그 행이 생기면 seq·누적 데미지가 부풀고 멱등 판정도 어긋난다.
      expect(await attackRowCount(raidId)).toBe(0);
    } finally {
      // 소모분 환급 + 채운 분 회수 → 공유 계정 잔액·원장을 영구히 바꾸지 않는다.
      await addDiamond(BigInt(cost) - toppedUp);
      await deleteLedgerSince(ledgerFrom);
    }
  });

  it('gemAttackRaid 동시 같은 idemKey: 과금 1회분 + raid_attacks 멱등 행 1건', async () => {
    const raidId = await makeRaid({});
    const idemKey = crypto.randomUUID();
    const cost = raidExtraAttackCost(1);

    const before0 = await readDiamond();
    const toppedUp = before0 < BigInt(cost) ? BigInt(cost) - before0 : 0n;
    await addDiamond(toppedUp);
    const before = before0 + toppedUp;
    const ledgerFrom = await ledgerMaxId();

    try {
      const rs = await Promise.allSettled(
        Array.from({ length: 3 }, () =>
          gemAttackRaid({ userId: TEST_USER_ID, serverId: SERVER_ID, raidId, idemKey }),
        ),
      );
      const ok = fulfilled(rs);
      expect(ok).toHaveLength(3);
      for (const v of ok) {
        expect(v.cost).toBe(cost);
        expect(v.damage).toBe(ok[0]!.damage); // 재공격이 아니라 기존 결과 복원
        expect(v.isCrit).toBe(ok[0]!.isCrit);
      }

      const part = await readPart(raidId);
      expect(part.attacksUsed).toBe(1);
      expect(part.extraAttacks).toBe(1);
      expect(part.totalDamage).toBe(BigInt(ok[0]!.damage));

      // 같은 키로 두 행이 생기면 이중 과금 + 이중 데미지 — raid_attacks_idem_uq(0109)의 존재 이유.
      expect(await attackRowCountByKey(idemKey)).toBe(1);
      expect(await attackRowCount(raidId)).toBe(1);

      expect(await readDiamond()).toBe(before - BigInt(cost));
      const led = await ledgerSince(ledgerFrom);
      expect(led.count).toBe(1);
      expect(led.sum).toBe(-BigInt(cost));
    } finally {
      await addDiamond(BigInt(cost) - toppedUp);
      await deleteLedgerSince(ledgerFrom);
    }
  });

  // ── 3. 정산 ↔ 공격 레이스 ──────────────────────────────────────────────────

  it('정산 ↔ 공격 만료 경계 동시 실행: 어느 쪽이 이기든 모순 없음', async () => {
    // 만료 시각을 now 기준 앞뒤로 흩어 경계를 훑는다 — 두 함수 모두 Date.now()로 만료를 보므로
    // expire_at을 JS 시각으로 박아야 오프셋이 의도대로 걸린다(DB now()와의 스큐 제거).
    for (const offsetMs of [-50, 0, 60, 200]) {
      const raidId = await makeRaid({
        phase1Hp: HP_TINY,
        expireAt: new Date(Date.now() + offsetMs),
      });
      const [s, a] = await Promise.allSettled([
        settleRaid({ raidId }),
        attackRaid({ userId: TEST_USER_ID, raidId }),
      ]);
      await expectNoContradiction(raidId, HP_TINY, s, a);
    }
  });

  it('공격 트랜잭션이 만료를 걸친 경우: 정산은 그 공격 데미지를 포함한다', async () => {
    const expireAt = new Date(Date.now() + 1_200);
    const raidId = await makeRaid({ phase1Hp: HP_TINY, expireAt });

    // 공격 tx는 수 ms라 "만료가 그 안에서 지나가는" 구간이 자연 재현되지 않는다. 그래서
    // raid_participants 행을 밖에서 잠가 공격을 **raids 행 락을 쥔 채** 붙잡아 둔다
    // (attackRaid는 참가자 락보다 먼저 만료를 재확인하므로, 파킹 시점엔 이미 통과한 상태다).
    let release!: () => void;
    let onLocked!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const locked = new Promise<void>((r) => { onLocked = r; });
    const holder = testDb.transaction(async (tx) => {
      await tx.execute(sql`
        select id from raid_participants
        where raid_id = ${raidId.toString()}::bigint and user_id = ${TEST_USER_ID}::uuid
        for update`);
      onLocked();
      await gate;
    });
    holder.catch(() => {}); // 아래 finally에서 정식으로 await — unhandled rejection 방지
    await locked;

    let s: PromiseSettledResult<SettleResult>;
    let a: PromiseSettledResult<AttackResult>;
    try {
      const attack = attackRaid({ userId: TEST_USER_ID, raidId });
      attack.catch(() => {});
      await waitRaidRowLocked(raidId, 3_000); // 공격이 raids 행을 잡을 때까지
      await sleep(Math.max(0, expireAt.getTime() + 200 - Date.now())); // 만료 통과

      const settle = settleRaid({ raidId }); // raids 행 락 대기 — 이 대기가 곧 가드다
      settle.catch(() => {});
      await sleep(200);

      release();
      await holder;
      [s, a] = await Promise.allSettled([settle, attack]);
    } finally {
      release();
      await holder.catch(() => {});
    }

    const atk = a.status === 'fulfilled' ? a.value : null;
    if (atk) {
      const st = s.status === 'fulfilled' ? s.value : null;
      expect(st?.settled).toBe(true);
      // 공격이 이미 커밋됐으니 정산은 그 참여자를 수상자로 보고 데미지를 합산해야 한다.
      // 정산이 raids 락을 안 잡으면 공격 커밋 전 스냅샷을 읽어 rewarded=0·phases=0이 된다.
      expect(st?.rewarded).toBe(1);
      expect(st?.phasesCleared).toBe(raidPhasesCleared(HP_TINY, atk.damage));
    } else {
      // 파킹이 안 걸린 스케줄 — 정산이 이겼다면 공격은 RAID_CLOSED로 떨어져야 한다.
      expect(errCode(a)).toBe('RAID_CLOSED');
    }
    await expectNoContradiction(raidId, HP_TINY, s, a);
  });

  /** raids 행이 다른 트랜잭션에 잠겼는지 — `for update nowait`가 55P03으로 튕기면 잠긴 것. */
  async function raidRowLocked(raidId: bigint): Promise<boolean> {
    try {
      await testDb.transaction(async (tx) => {
        await tx.execute(sql`select 1 from raids where id = ${raidId.toString()}::bigint for update nowait`);
      });
      return false;
    } catch {
      return true;
    }
  }

  async function waitRaidRowLocked(raidId: bigint, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await raidRowLocked(raidId)) return true;
      await sleep(25);
    }
    return false; // 못 잡아도 진행 — 단정은 두 스케줄 모두를 허용한다
  }
});
