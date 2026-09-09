import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { walletAdd } from '@/lib/game/wallet';
import { guilds, guildMembers, zones } from '@/lib/db/schema/guild';

import { GUILD_EXECUTOR_TAX_CUT, TAX_COLLECT_COOLDOWN_MIN } from './balance';
import { logGuildAudit } from './audit';
import { GuildError } from './errors';
import { hasGuildPerm } from './permissions';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** `db` 또는 그와 같은 모양의 실행기(테스트에서는 바깥 트랜잭션을 넘겨 세이브포인트로 돌린다). */
type TxRunner = { transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>; execute: Tx['execute'] };

export type CollectResult = {
  zoneId: number;
  /** 집행관 몫(10%, floor) — 집행관 지갑으로. */
  executorGain: bigint;
  /** 길드 곳간 입금(잔여 90%+). */
  guildGain: bigint;
  /** 집행관 몫을 받은 사람 — 대리 수금이면 행위자와 다르다. */
  executorUserId: string;
};

/**
 * 구역 세금 수금 — GUILD §5.5. 3일(72h) 쿨다운. 구역 누적 💎 → 집행관 10% + 소유 길드 곳간 90%.
 *
 * 수금 주체(2026-09-08 일괄 수금 도입):
 *  - 그 구역 **집행관 본인**(종전 그대로), 또는
 *  - 소유 길드의 **세금 권한자**(길드장 · taxDistribute 부길드장)의 **대리 수금** — 집행관 몫 10%는
 *    그래도 집행관 지갑으로 간다(집행관은 방어를 맡은 대가로 받는 것이지 버튼을 누른 대가가 아니다).
 *  - **집행관 공석 구역은 누구도 수금 불가**(💎 동결 유지 — 집행관 지정 유인).
 *
 * 단일 트랜잭션 안에서 실행되도록 tx를 받는다(일괄 수금·테스트 공용). 락 순서 characters → zones.
 */
export async function collectZoneTaxTx(
  tx: Tx,
  input: { userId: string; zoneId: number },
): Promise<CollectResult> {
  // 소유·집행관을 먼저 읽는다(락 없이) — 잠글 characters 행이 **집행관**의 것이기 때문(지갑 입금 대상).
  const [pre] = await tx
    .select({ executor: zones.executorUserId, owner: zones.ownerGuildId })
    .from(zones)
    .where(eq(zones.id, input.zoneId));
  if (!pre) throw new GuildError('ZONE_NOT_FOUND');
  if (!pre.owner || !pre.executor) throw new GuildError('NOT_EXECUTOR');

  // 락 순서 통일(characters → zones): 지출 세금 훅(walletTrySpend가 characters를 잠근 뒤 거주 구역 zones 갱신)과
  // 반대 순서로 잠그면 집행관 본인의 강화 단축·구매와 교착한다. 집행관 = 그 구역 거주자라 같은 두 행이 겹친다.
  await tx.execute(sql`select 1 from characters where user_id = ${pre.executor}::uuid for update`);
  const [z] = await tx
    .select({
      executor: zones.executorUserId,
      owner: zones.ownerGuildId,
      serverId: zones.serverId,
      tax: zones.taxDiamond,
      lastAt: zones.lastTaxCollectedAt,
      capturedAt: zones.capturedAt,
    })
    .from(zones)
    .where(eq(zones.id, input.zoneId))
    .for('update');
  if (!z) throw new GuildError('ZONE_NOT_FOUND');
  // 락 대기 중 집행관·소유가 바뀌었으면 처음부터 다시(드문 경합 — 호출자가 재시도하거나 실패로 본다).
  if (!z.owner || !z.executor || z.executor !== pre.executor || z.owner !== pre.owner) {
    throw new GuildError('NOT_EXECUTOR');
  }

  // 행위자 판정 — 집행관 본인이 아니면 소유 길드의 세금 권한자여야 한다.
  if (z.executor !== input.userId) {
    const [actor] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role, permissions: guildMembers.permissions })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, input.userId), eq(guildMembers.serverId, z.serverId)));
    if (!actor || actor.guildId !== z.owner) throw new GuildError('NOT_EXECUTOR');
    if (!hasGuildPerm(actor.role, actor.permissions, 'taxDistribute')) throw new GuildError('NO_PERMISSION');
  }
  // 집행관이 여전히 소유 길드 소속인지 재검증 — 이탈 정리 누락 등에 대비한 방어선(비길드원 세수 탈취 차단).
  const [mem] = await tx
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(and(eq(guildMembers.userId, z.executor), eq(guildMembers.serverId, z.serverId)));
  if (!mem || mem.guildId !== z.owner) throw new GuildError('NOT_EXECUTOR');

  const now = Date.now();
  const cooldownMs = TAX_COLLECT_COOLDOWN_MIN * 60_000;
  // 첫 수금 게이트(B안) — 구역 습득(captured_at) 후 72h 지나야 첫 수금 가능. 탈취 시 captured_at이
  // 갱신되고 last_tax_collected_at도 리셋되므로, 뺏은 길드도 72h 뒤부터 수금(리셋).
  if (z.capturedAt && now - z.capturedAt.getTime() < cooldownMs) {
    throw new GuildError('COLLECT_COOLDOWN');
  }
  // 이후 쿨다운 — 직전 수금 후 72h.
  if (z.lastAt && now - z.lastAt.getTime() < cooldownMs) {
    throw new GuildError('COLLECT_COOLDOWN');
  }
  const tax = z.tax; // bigint
  if (tax <= 0n) throw new GuildError('NOTHING_TO_COLLECT');

  // 집행관 몫(10%, floor) / 길드 몫(잔여 = 90%+).
  const executorGain = (tax * BigInt(Math.round(GUILD_EXECUTOR_TAX_CUT * 100))) / 100n;
  const guildGain = tax - executorGain;

  // 집행관 몫은 존이 속한 서버의 **집행관** 지갑으로(활성 서버·행위자 무관).
  await walletAdd(tx, z.executor, z.serverId, executorGain, 'guild_tax');
  await tx
    .update(guilds)
    .set({ taxPoolDiamond: sql`${guilds.taxPoolDiamond} + ${guildGain}` })
    .where(eq(guilds.id, z.owner));
  await tx
    .update(zones)
    .set({ taxDiamond: 0n, lastTaxCollectedAt: sql`now()` })
    .where(eq(zones.id, input.zoneId));

  // 활동 로그 — 길드 곳간으로 들어간 몫(90%+) 기준. 행위자 = 버튼을 누른 사람(대리 수금이면 권한자).
  await logGuildAudit(tx, {
    serverId: z.serverId,
    guildId: z.owner,
    actorUserId: input.userId,
    action: 'tax_collect',
    detail: { amount: guildGain.toString(), zoneId: input.zoneId },
  });

  return { zoneId: input.zoneId, executorGain, guildGain, executorUserId: z.executor };
}

/** 구역 1곳 수금 — 단일 트랜잭션, 구역 행 for update. */
export function collectZoneTax(input: { userId: string; zoneId: number }): Promise<CollectResult> {
  return db.transaction((tx) => collectZoneTaxTx(tx, input));
}

export type CollectAllResult = {
  /** 실제로 수금된 구역. */
  collected: CollectResult[];
  /** 시도했으나 거부된 구역(경합으로 그 사이 쿨다운·집행관 변동 등) — 사유 코드. */
  failed: { zoneId: number; code: string }[];
  /** 수금 총액(집행관 몫 + 곳간 입금). */
  total: bigint;
  /** 곳간 입금 합계. */
  guildGain: bigint;
  /** 집행관 몫 합계. */
  executorGain: bigint;
  /** 그중 행위자 본인 지갑에 들어온 몫(행위자가 집행관인 구역이 있을 때만 > 0). */
  myGain: bigint;
};

/**
 * 일괄 수금(2026-09-08) — 세금 권한자가 길드의 **수금 가능한 구역을 한 번에** 걷는다.
 *
 * 구역마다 **별도 트랜잭션**으로 돈다 — 한 트랜잭션에 여러 집행관의 characters 행과 여러 zones 행을
 * 잠그면 지출 세금 훅(characters → 거주 zones)과 교차 교착이 생긴다(집행관 B가 구역 1에 거주하는 경우).
 * 구역 하나가 거부돼도(경합) 나머지는 그대로 진행하고 실패 목록으로 돌려준다.
 * 로그는 구역별 tax_collect 그대로(합산 로그를 따로 남기지 않는다 — 구역 단위 기록이 정본).
 */
export async function collectAllZoneTax(
  input: { userId: string; serverId: number },
  runner: TxRunner = db,
): Promise<CollectAllResult> {
  // 권한 — 세금 권한자만(집행관 본인 구역만 걷고 싶으면 지도의 개별 수금).
  const [actor] = (await runner.execute(sql`
    select guild_id::text as guild_id, role::text as role, permissions from guild_members
     where user_id = ${input.userId}::uuid and server_id = ${input.serverId} limit 1
  `)) as unknown as { guild_id: string; role: 'leader' | 'vice' | 'member'; permissions: number | null }[];
  if (!actor) throw new GuildError('NOT_IN_GUILD');
  if (!hasGuildPerm(actor.role, actor.permissions, 'taxDistribute')) throw new GuildError('NO_PERMISSION');

  const ids = await listCollectableZoneIds(BigInt(actor.guild_id), input.serverId, runner);
  if (ids.length === 0) throw new GuildError('NOTHING_TO_COLLECT');

  const collected: CollectResult[] = [];
  const failed: { zoneId: number; code: string }[] = [];
  for (const zoneId of ids) {
    try {
      collected.push(await runner.transaction((tx) => collectZoneTaxTx(tx, { userId: input.userId, zoneId })));
    } catch (e) {
      // 구역 단위 커밋이라 여기서 던지면 앞서 걷힌 구역이 "실패"로 보고된다(검토 지적) — 어떤 오류든
      // 건너뛰고 계속, 비정상 오류만 로그.
      if (e instanceof GuildError) failed.push({ zoneId, code: e.code });
      else {
        console.error('[guild.collectAll]', zoneId, e);
        failed.push({ zoneId, code: 'UNKNOWN' });
      }
    }
  }
  if (collected.length === 0) {
    // 전부 거부 — 화면이 본 '수금 가능'이 그 사이 사라진 것. 권한 문제가 아니면 쿨다운/없음으로 말한다
    // (NOT_EXECUTOR는 집행관 문구라 대리 수금자에게 맞지 않는다).
    const codes = new Set(failed.map((f) => f.code));
    const code: GuildError['code'] = codes.has('NO_PERMISSION')
      ? 'NO_PERMISSION'
      : codes.has('NOT_IN_GUILD')
        ? 'NOT_IN_GUILD'
        : codes.has('COLLECT_COOLDOWN')
          ? 'COLLECT_COOLDOWN'
          : 'NOTHING_TO_COLLECT';
    throw new GuildError(code);
  }
  const guildGain = collected.reduce((n, c) => n + c.guildGain, 0n);
  const executorGain = collected.reduce((n, c) => n + c.executorGain, 0n);
  const myGain = collected.filter((c) => c.executorUserId === input.userId).reduce((n, c) => n + c.executorGain, 0n);
  return { collected, failed, total: guildGain + executorGain, guildGain, executorGain, myGain };
}

/** 지금 수금 가능한 구역 id(집행관 있음 · 세금 > 0 · 습득/직전 수금 72h 경과) — id 순. */
export async function listCollectableZoneIds(
  guildId: bigint,
  serverId: number,
  runner: { execute: Tx['execute'] } = db,
): Promise<number[]> {
  const cooldownMin = TAX_COLLECT_COOLDOWN_MIN;
  // 앱 시계 하나로 판정(검토 지적) — 화면(getTaxCollectView)·구역 수금(collect)과 같은 기준. DB now()와의
  // 미세 오차로 화면엔 '수금 가능'인데 목록에서 빠져 조용히 건너뛰는 일을 없앤다.
  const at = new Date().toISOString(); // Date 인스턴스는 raw execute 파라미터로 못 넘긴다(postgres-js)
  const rows = (await runner.execute(sql`
    select z.id
      from zones z
     where z.server_id = ${serverId} and z.owner_guild_id = ${guildId}
       and z.executor_user_id is not null
       and z.tax_diamond > 0
       and (z.captured_at is null or z.captured_at <= ${at}::timestamptz - (${cooldownMin} || ' minutes')::interval)
       and (z.last_tax_collected_at is null
            or z.last_tax_collected_at <= ${at}::timestamptz - (${cooldownMin} || ' minutes')::interval)
     order by z.id
  `)) as unknown as { id: number }[];
  return rows.map((r) => Number(r.id));
}
