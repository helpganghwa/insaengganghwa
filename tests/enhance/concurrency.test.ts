import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { queueEnhance, type EnhanceError } from '@/lib/game/enhance/queue';
import { reduceEnhanceTime } from '@/lib/game/enhance/reduceTime';
import { resolveEnhance } from '@/lib/game/enhance/resolve';
import { GEM_TO_MS } from '@/lib/game/balance';

import { endTestDb, makeRunningJob, pickUnusedCatalogId, sql, testDb } from '../db';

const TEST_USER_ID = process.env.TEST_USER_ID ?? '';
const SERVER_ID = 1; // user_equipment.server_id 기본값 — 잡·지갑이 모두 이 서버로 떨어진다.
const skip = !TEST_USER_ID;

/**
 * 강화 동시성 가드 DB 통합 — 락 없이 **DB 제약 + 조건부 전이**로만 막는 구간의 회귀 방지.
 * queue는 앱에서 빈 lane을 읽고 쓰는 read-then-write라 부분 유니크(ej_*_running_uq)가
 * 최후 방어이고, resolve는 RT1↔RT2 사이에 끼어드는 reduceEnhanceTime을 complete_at
 * 불변 조건으로 걸러낸다. 둘 다 승자가 어느 쪽이든 **불변식**만 단정한다(순서 의존 금지).
 *
 * 공유 스테이징 DB(DIRECT_URL) — 생성한 장비/잡은 afterEach에서 반드시 정리.
 */
describe.skipIf(skip)('강화 동시성 가드 — DB 통합', () => {
  // 정리 대상 user_equipment id — 잡·로그가 이 행을 참조하므로 삭제 기준점으로 삼는다.
  const createdEquipIds: bigint[] = [];

  afterEach(async () => {
    // 생성 역순 정리(best-effort) — 로그·잡 → 장비. gem_time_reductions는 잡 삭제에 cascade.
    for (const id of [...createdEquipIds].reverse()) {
      const eid = id.toString();
      try {
        await testDb.execute(sql`delete from enhancement_logs where user_equipment_id = ${eid}::bigint`);
      } catch {}
      try {
        await testDb.execute(sql`delete from enhancement_jobs where user_equipment_id = ${eid}::bigint`);
      } catch {}
      try {
        await testDb.execute(sql`delete from user_equipment where id = ${eid}::bigint`);
      } catch {}
    }
    createdEquipIds.length = 0;
  });

  afterAll(async () => {
    await endTestDb();
  });

  async function insertEquip(catalogItemId: number, level: number): Promise<bigint> {
    const r = (await testDb.execute(sql`
      insert into user_equipment (user_id, catalog_item_id, enhance_level, transcend_level)
      values (${TEST_USER_ID}::uuid, ${catalogItemId}, ${level}, 0)
      returning id::text id`)) as unknown as { id: string }[];
    const id = BigInt(r[0]!.id);
    createdEquipIds.push(id);
    return id;
  }

  /**
   * 거절 사유 — EnhanceError면 그 code, 아니면 원인 체인의 SQLSTATE.
   * drizzle 0.45는 드라이버 에러를 DrizzleQueryError로 감싸므로(code 없음, message='Failed query: …')
   * 부분 유니크 위반 여부는 cause를 따라가야 보인다.
   */
  function rejectReason(r: PromiseSettledResult<unknown>): string {
    if (r.status !== 'rejected') return '';
    let e: unknown = r.reason;
    for (let i = 0; e != null && i < 5; i += 1) {
      const o = e as Partial<EnhanceError> & { code?: string; cause?: unknown };
      if (typeof o.code === 'string') return o.code;
      e = o.cause;
    }
    return String((r.reason as Error)?.message ?? r.reason);
  }

  it('같은 장비 동시 등록: 정확히 1건만 성공(장비당 running 1건)', async () => {
    const catalogItemId = await pickUnusedCatalogId(TEST_USER_ID);
    const equipId = await insertEquip(catalogItemId, 7);

    // lane을 일부러 갈라 요청한다 — 같은 lane이면 slot lane 유니크가 먼저 걸려 이 케이스가
    // 정작 검증하려는 ej_equipment_running_uq(장비당 1건)를 지나칠 수 있다.
    const rs = await Promise.allSettled([
      queueEnhance({ userId: TEST_USER_ID, userEquipmentId: equipId, preferredLane: 1 }),
      queueEnhance({ userId: TEST_USER_ID, userEquipmentId: equipId, preferredLane: 2 }),
    ]);

    // 어느 쪽이 이기든 성공 1건 — 장비 행 FOR UPDATE로 직렬화되므로 패자는 앱 가드
    // (ALREADY_ENHANCING)에 걸린다. 최후 방어인 부분 유니크(SLOT_BUSY/23505)도 허용해
    // 잠금 순서가 바뀌어도 이 케이스가 흔들리지 않게 한다.
    expect(rs.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of rs.filter((x) => x.status === 'rejected')) {
      expect(['ALREADY_ENHANCING', 'SLOT_BUSY', '23505']).toContain(rejectReason(r));
    }

    const n = (await testDb.execute(sql`
      select count(*)::int c from enhancement_jobs
      where user_equipment_id = ${equipId.toString()}::bigint and status = 'running'`)) as unknown as {
      c: number;
    }[];
    expect(Number(n[0]?.c)).toBe(1); // ej_equipment_running_uq
  });

  it('lane 소진 경합: 같은 슬롯 3건 동시 등록 → running 최대 2건·lane 중복 없음', async () => {
    const catalogIds = await pickUnusedCatalogIdsSameSlot(3);
    // 순차 생성 — 중간 실패 시에도 만들어진 행이 전부 정리 목록에 들어간다.
    const equipIds: bigint[] = [];
    for (const c of catalogIds) equipIds.push(await insertEquip(c, 4));

    const rs = await Promise.allSettled(
      equipIds.map((id) => queueEnhance({ userId: TEST_USER_ID, userEquipmentId: id })),
    );
    const ok = rs.filter((r) => r.status === 'fulfilled');

    // lane 배정이 앱단 read-then-write라 셋이 겹쳐 읽으면 전부 같은 빈 lane을 고르고, 그때는
    // 부분 유니크가 둘을 쳐내 성공이 1건이 된다. 즉 성공 개수는 스케줄에 따라 1~2로 흔들리며
    // 가드가 보장하는 값이 아니다 — 불변식은 아래 "running ≤ 2 + lane 중복 0"이다.
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(ok.length).toBeLessThanOrEqual(2);
    // 패자는 앱 가드(SLOT_BUSY)거나 최소한 부분 유니크(23505)에 막혀야 한다.
    // 둘 다 허용하는 이유 = 어느 가드가 먼저 걸리는지는 스케줄에 달렸기 때문(둘 다 정상 차단).
    for (const r of rs.filter((x) => x.status === 'rejected')) {
      expect(['SLOT_BUSY', '23505']).toContain(rejectReason(r));
    }

    const rows = (await testDb.execute(sql`
      select slot_lane from enhancement_jobs
      where user_equipment_id in ${sql.raw(`(${equipIds.map((i) => i.toString()).join(',')})`)}
        and status = 'running'`)) as unknown as { slot_lane: number }[];
    // 부위당 2 lane 상한 + lane 중복 0 — 뚫리면 한 슬롯에 3건이 붙거나 같은 lane이 두 번 잡힌다.
    expect(rows).toHaveLength(ok.length);
    expect(rows.length).toBeLessThanOrEqual(2);
    const lanes = rows.map((r) => Number(r.slot_lane));
    expect(new Set(lanes).size).toBe(lanes.length); // ej_user_slot_lane_running_uq
    for (const l of lanes) expect([1, 2]).toContain(l);
  });

  it('보석 단축 ↔ 수령 레이스: 정확히 하나만 성공, 다이아는 단축 성공 시에만 차감', async () => {
    const catalogItemId = await pickUnusedCatalogId(TEST_USER_ID);
    // timing='zero'(완료 1시간 뒤) — 단축이 실제로 다이아를 태우고 complete_at을 옮기는 상태.
    const { jobId, instanceId } = await makeRunningJob({
      userId: TEST_USER_ID,
      catalogItemId,
      fromLevel: 10,
      baseRateBp: 10000,
      timing: 'zero',
    });
    createdEquipIds.push(instanceId);

    const COST = 3;
    const before0 = await readDiamond();
    // 잔액이 모자란 계정에서도 돌도록 필요한 만큼만 채우고 finally에서 원복(영구 변동 0).
    const toppedUp = before0 < BigInt(COST) ? BigInt(COST) - before0 : 0n;
    if (toppedUp > 0n) await addDiamond(toppedUp);
    // 아래 단정이 **이 테스트가 태운 분**만 보게 하는 워터마크(레이스 직전 기준점).
    const gemFrom = await gemMaxId();

    let spent = 0n;
    try {
      const [reduced, resolved] = await Promise.allSettled([
        reduceEnhanceTime({ userId: TEST_USER_ID, jobId, diamonds: COST }),
        // L=10은 down=0, timing='zero'라 success=0 → roll과 무관하게 hold(레벨 불변).
        resolveEnhance({ jobId, userId: TEST_USER_ID, rngBp: () => 9999 }),
      ]);
      const reduceOk = reduced.status === 'fulfilled';
      const resolveOk = resolved.status === 'fulfilled';
      spent = reduceOk ? BigInt(COST) : 0n;

      // 둘 다 성공하면 완료된 잡에 다이아가 탔거나 정산이 옛 complete_at 기준으로 들어간 것.
      expect(Number(reduceOk) + Number(resolveOk)).toBe(1);
      if (!reduceOk) expect(rejectReason(reduced)).toBe('JOB_NOT_FOUND');
      if (!resolveOk) expect(rejectReason(resolved)).toBe('JOB_NOT_FOUND');
      if (reduceOk) expect(reduced.value.reducedMs).toBe(COST * GEM_TO_MS);

      // 다이아 정합 — 단축이 이겼을 때만 정확히 COST 차감.
      //
      // 지갑 **절대 잔액은 보지 않는다**: characters.diamond는 공유 테스트 계정의 단일 행이라
      // before를 읽은 뒤 이 단정까지의 창에 외부 변동이 하나만 끼어도 실측이 흔들린다
      // (원장 없는 raw UPDATE로 들어오면 사후 식별조차 안 된다).
      // 대신 **차감과 같은 트랜잭션**에서만 생기는 gem_time_reductions를 워터마크 이후로 센다.
      // 이 경로는 diamond_ledger 제외 사유(enhance_reduce, lib/game/ledger.ts LEDGER_SKIP_REASONS)
      // 라서 원장 역할을 이 테이블이 대신한다. walletTrySpend가 false면 tx 전체가 롤백돼 행도
      // 남지 않으므로 "행 있음 ⟺ gems_spent만큼 실제 차감"이 성립한다
      // (walletTrySpend 자체의 차감 산술은 tests/wallet.test.ts가 롤백 격리로 따로 지킨다).
      const gemSince = (await testDb.execute(sql`
        select count(*)::int c, coalesce(sum(gems_spent), 0)::text s
        from gem_time_reductions
        where user_id = ${TEST_USER_ID}::uuid and id > ${gemFrom.toString()}::bigint`)) as unknown as {
        c: number;
        s: string;
      }[];
      expect(Number(gemSince[0]?.c)).toBe(reduceOk ? 1 : 0); // 이중 과금은 2건으로 드러난다
      expect(BigInt(gemSince[0]?.s ?? '0')).toBe(spent);

      const gem = (await testDb.execute(sql`
        select count(*)::int c, coalesce(sum(gems_spent), 0)::text s
        from gem_time_reductions where job_id = ${jobId.toString()}::bigint`)) as unknown as {
        c: number;
        s: string;
      }[];
      expect(Number(gem[0]?.c)).toBe(reduceOk ? 1 : 0);
      expect(BigInt(gem[0]?.s ?? '0')).toBe(spent);

      // 태운 만큼 잡도 당겨졌는지 — 같은 tx의 나머지 절반. 차감만 되고 시간이 그대로면 순수 손해다.
      const job = (await testDb.execute(sql`
        select total_reduced_ms::text r from enhancement_jobs
        where id = ${jobId.toString()}::bigint`)) as unknown as { r: string }[];
      expect(BigInt(job[0]!.r)).toBe(spent * BigInt(GEM_TO_MS));
    } finally {
      // 소모분 환급 + 채운 분 회수 — 공유 계정 잔액을 영구히 바꾸지 않는다.
      if (spent !== 0n || toppedUp !== 0n) await addDiamond(spent - toppedUp);
    }
  });

  /** 두 lane이 모두 빈 슬롯에서 미보유 catalog n개 — lane 소진 경합용(테스트 격리). */
  async function pickUnusedCatalogIdsSameSlot(n: number): Promise<number[]> {
    const rows = (await testDb.execute(sql`
      with rc as (
        select slot, count(*)::int n from enhancement_jobs
        where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID} and status = 'running'
        group by slot
      ),
      avail as (
        select c.id, c.slot from catalog_items c
        left join rc on rc.slot = c.slot
        where c.active and coalesce(rc.n, 0) = 0
          and not exists (
            select 1 from user_equipment
            where user_id = ${TEST_USER_ID}::uuid and catalog_item_id = c.id
          )
      )
      select id from avail
      where slot = (select slot from avail group by slot having count(*) >= ${n} order by slot limit 1)
      order by id limit ${n}
    `)) as unknown as { id: number }[];
    if (rows.length < n) {
      throw new Error(`테스트 유저: lane이 모두 빈 슬롯에 미보유 catalog ${n}개 없음 — 정리 필요`);
    }
    return rows.map((r) => Number(r.id));
  }

  async function readDiamond(): Promise<bigint> {
    const r = (await testDb.execute(sql`
      select diamond::text d from characters
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`)) as unknown as {
      d: string;
    }[];
    return BigInt(r[0]?.d ?? '0');
  }

  /** 워터마크 기준점 — 이 값 이후 행만 "이번 레이스가 만든 것". */
  async function gemMaxId(): Promise<bigint> {
    const r = (await testDb.execute(sql`
      select coalesce(max(id), 0)::text m from gem_time_reductions
      where user_id = ${TEST_USER_ID}::uuid`)) as unknown as { m: string }[];
    return BigInt(r[0]!.m);
  }

  /** 잔액 보정 전용(원장 미기록) — enhance_reduce 자체가 원장 제외 사유라 정합이 어긋나지 않는다. */
  async function addDiamond(delta: bigint): Promise<void> {
    await testDb.execute(sql`
      update characters set diamond = diamond + ${delta.toString()}::bigint
      where user_id = ${TEST_USER_ID}::uuid and server_id = ${SERVER_ID}`);
  }
});
