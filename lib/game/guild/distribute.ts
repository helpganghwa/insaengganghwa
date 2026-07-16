import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, guildMembers, guildTaxDistributions, guildAuditLog } from '@/lib/db/schema/guild';
import { mailbox } from '@/lib/db/schema/mailbox';
import { characters } from '@/lib/db/schema/server';

import type { GuildTaxDistribution } from './balance';
import { logGuildAudit } from './audit';
import { GuildError } from './errors';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 분배 지급 = 보상 우편(2026-07-16 문의 반영) — 지갑 직접 입금은 수령 인지가 불가능했음.
 *  수령형 우편(첨부 💎)이라 우편함 빨간 점·홈 배지로 알림까지 해결. 만료 30일(기본). */
async function sendTaxMails(
  tx: Tx,
  serverId: number,
  guildName: string,
  leaderNick: string,
  rows: { userId: string; amount: bigint }[],
): Promise<void> {
  if (rows.length === 0) return;
  await tx.insert(mailbox).values(
    rows.map((r) => ({
      userId: r.userId,
      serverId,
      type: 'reward' as const,
      title: '길드 세금 분배',
      body: `${guildName} 길드장 ${leaderNick}님이 세금 💎${r.amount.toLocaleString('ko-KR')}을 분배했습니다.`,
      senderLabel: '길드',
      payload: { diamond: Number(r.amount) },
    })),
  );
}

/** 분배 우편 문구용 — 길드명 + 길드장 닉네임(캐릭터 행 부재 시 폴백). */
async function guildMailMeta(tx: Tx, guildId: bigint, leaderUserId: string, serverId: number) {
  const [g] = await tx.select({ name: guilds.name }).from(guilds).where(eq(guilds.id, guildId)).limit(1);
  const [c] = await tx
    .select({ nick: characters.nickname })
    .from(characters)
    .where(and(eq(characters.userId, leaderUserId), eq(characters.serverId, serverId)))
    .limit(1);
  return { guildName: g?.name ?? '길드', leaderNick: c?.nick ?? '길드장' };
}

/**
 * 길드 세금 풀 분배 — GUILD §5.5. 길드장만. 분배 내역 로그 기록(공개).
 * - equal: 풀을 길드원 N으로 균등(각 floor(pool/N)), 잔여는 풀에 carry.
 * - target: 풀 전액을 특정 길드원에게.
 * 지급은 **보상 우편**(sendTaxMails) — 즉시 입금 아님(수령 시 지갑 반영).
 */
export function distributeGuildTax(input: {
  leaderUserId: string;
  serverId: number;
  mode: GuildTaxDistribution;
  targetUserId?: string;
}): Promise<{ total: bigint; perMember: bigint | null }> {
  return db.transaction(async (tx) => {
    const [leader] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, input.leaderUserId), eq(guildMembers.serverId, input.serverId)))
      .for('update');
    if (!leader) throw new GuildError('NOT_IN_GUILD');
    if (leader.role !== 'leader') throw new GuildError('NOT_LEADER');

    const gid = leader.guildId;
    const [g] = await tx
      .select({ pool: guilds.taxPoolDiamond })
      .from(guilds)
      .where(eq(guilds.id, gid))
      .for('update');
    const pool = g!.pool;
    if (pool <= 0n) throw new GuildError('NOTHING_TO_DISTRIBUTE');

    if (input.mode === 'target') {
      if (!input.targetUserId) throw new GuildError('INVALID_TARGET');
      const [t] = await tx
        .select({ u: guildMembers.userId })
        .from(guildMembers)
        .where(and(eq(guildMembers.userId, input.targetUserId), eq(guildMembers.guildId, gid)))
        .limit(1);
      if (!t) throw new GuildError('TARGET_NOT_IN_GUILD');
      const meta = await guildMailMeta(tx, gid, input.leaderUserId, input.serverId);
      await sendTaxMails(tx, input.serverId, meta.guildName, meta.leaderNick, [
        { userId: input.targetUserId, amount: pool },
      ]);
      await tx.update(guilds).set({ taxPoolDiamond: 0n }).where(eq(guilds.id, gid));
      await tx.insert(guildTaxDistributions).values({
        guildId: gid,
        byUserId: input.leaderUserId,
        mode: 'target',
        total: pool,
        targetUserId: input.targetUserId,
      });
      await logGuildAudit(tx, {
        serverId: input.serverId,
        guildId: gid,
        actorUserId: input.leaderUserId,
        action: 'tax_distribute',
        targetUserId: input.targetUserId,
        detail: { amount: pool.toString(), mode: 'target' },
      });
      return { total: pool, perMember: null };
    }

    // equal — 길드원 userId 수집 후 각자 walletAdd. 차감액 = 실제 지급 합계로 일치(💎 증발 방지),
    // 캐릭터 행 부재 멤버가 끼면 walletAdd가 명시 실패→tx 롤백(조용한 유실 대신).
    const members = await tx
      .select({ u: guildMembers.userId })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, gid));
    const n = BigInt(members.length);
    if (n <= 0n) throw new GuildError('NOTHING_TO_DISTRIBUTE');
    const per = pool / n; // floor
    if (per <= 0n) throw new GuildError('NOTHING_TO_DISTRIBUTE'); // 풀 < 인원
    const distributed = per * n;

    const metaEq = await guildMailMeta(tx, gid, input.leaderUserId, input.serverId);
    await sendTaxMails(
      tx,
      input.serverId,
      metaEq.guildName,
      metaEq.leaderNick,
      members.map((m) => ({ userId: m.u, amount: per })),
    );
    await tx
      .update(guilds)
      .set({ taxPoolDiamond: sql`${guilds.taxPoolDiamond} - ${distributed}` })
      .where(eq(guilds.id, gid));
    await tx.insert(guildTaxDistributions).values({
      guildId: gid,
      byUserId: input.leaderUserId,
      mode: 'equal',
      total: distributed,
    });
    // 활동 로그 — 수령자 1인당 1줄(누구에게 N💎 지급). 최대 50인 직렬 insert → 단일 multi-row
    // insert로(감사 G-05: 락 보유 시간 단축, tx당 왕복 N→1). revealConquest와 동일 패턴.
    await tx.insert(guildAuditLog).values(
      members.map((m) => ({
        serverId: input.serverId,
        guildId: gid,
        actorUserId: input.leaderUserId,
        action: 'tax_distribute' as const,
        targetUserId: m.u,
        detail: { amount: per.toString(), mode: 'equal' },
      })),
    );
    return { total: distributed, perMember: per };
  });
}

/**
 * 길드 세금 풀 수동 분배 — 길드장만. 길드원별 지정 금액(💎)을 각자에게 지급, 총액만큼 풀 차감.
 * 잔여는 풀에 carry. 분배 페이지(입력란)에서 사용.
 */
export function distributeGuildTaxManual(input: {
  leaderUserId: string;
  serverId: number;
  amounts: { userId: string; amount: number }[];
}): Promise<{ total: bigint }> {
  return db.transaction(async (tx) => {
    const [leader] = await tx
      .select({ guildId: guildMembers.guildId, role: guildMembers.role })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, input.leaderUserId), eq(guildMembers.serverId, input.serverId)))
      .for('update');
    if (!leader) throw new GuildError('NOT_IN_GUILD');
    if (leader.role !== 'leader') throw new GuildError('NOT_LEADER');
    const gid = leader.guildId;

    // 거대 배열 루프 비용 방어(감사 LOW) — 정원보다 큰 입력은 잘라냄. 양수·정수만, 같은 유저 합산.
    const byUser = new Map<string, bigint>();
    for (const a of input.amounts.slice(0, 100)) {
      const amt = Math.floor(Number(a.amount));
      if (!Number.isFinite(amt) || amt <= 0) continue;
      byUser.set(a.userId, (byUser.get(a.userId) ?? 0n) + BigInt(amt));
    }
    if (byUser.size === 0) throw new GuildError('NOTHING_TO_DISTRIBUTE');
    const total = [...byUser.values()].reduce((s, v) => s + v, 0n);

    const [g] = await tx
      .select({ pool: guilds.taxPoolDiamond })
      .from(guilds)
      .where(eq(guilds.id, gid))
      .for('update');
    if (total > g!.pool) throw new GuildError('DISTRIBUTE_OVER_POOL');

    // 모든 대상이 길드원인지 검증.
    const memberRows = await tx
      .select({ u: guildMembers.userId })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, gid));
    const memberSet = new Set(memberRows.map((r) => r.u));
    for (const uid of byUser.keys()) if (!memberSet.has(uid)) throw new GuildError('TARGET_NOT_IN_GUILD');

    const metaMan = await guildMailMeta(tx, gid, input.leaderUserId, input.serverId);
    await sendTaxMails(
      tx,
      input.serverId,
      metaMan.guildName,
      metaMan.leaderNick,
      [...byUser].map(([uid, amt]) => ({ userId: uid, amount: amt })),
    );
    await tx
      .update(guilds)
      .set({ taxPoolDiamond: sql`${guilds.taxPoolDiamond} - ${total}` })
      .where(eq(guilds.id, gid));
    await tx.insert(guildTaxDistributions).values({
      guildId: gid,
      byUserId: input.leaderUserId,
      mode: 'manual',
      total,
    });
    // 활동 로그 — 지정 금액 받은 수령자 1인당 1줄. 직렬 insert → 단일 multi-row(감사 G-05).
    await tx.insert(guildAuditLog).values(
      [...byUser].map(([uid, amt]) => ({
        serverId: input.serverId,
        guildId: gid,
        actorUserId: input.leaderUserId,
        action: 'tax_distribute' as const,
        targetUserId: uid,
        detail: { amount: amt.toString(), mode: 'manual' },
      })),
    );
    return { total };
  });
}
