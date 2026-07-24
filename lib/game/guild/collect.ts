import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { walletAdd } from '@/lib/game/wallet';
import { guilds, guildMembers, zones } from '@/lib/db/schema/guild';

import { GUILD_EXECUTOR_TAX_CUT, TAX_COLLECT_COOLDOWN_MIN } from './balance';
import { logGuildAudit } from './audit';
import { GuildError } from './errors';

/**
 * 집행관 세금 수금 — GUILD §5.5. 그 구역 집행관만, 3일(72h) 쿨다운. 구역 누적 💎 →
 * 집행관 10% + 소유 길드 풀 90%. 단일 트랜잭션, 구역 행 for update.
 */
export function collectZoneTax(input: {
  userId: string;
  zoneId: number;
}): Promise<{ executorGain: bigint; guildGain: bigint }> {
  return db.transaction(async (tx) => {
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
    if (z.executor !== input.userId || !z.owner) throw new GuildError('NOT_EXECUTOR');
    // 집행관이 여전히 소유 길드 소속인지 재검증 — 이탈 정리 누락 등에 대비한 방어선(비길드원 세수 탈취 차단).
    const [mem] = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, input.userId), eq(guildMembers.serverId, z.serverId)));
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

    // 집행관 몫은 존이 속한 서버 지갑으로(활성 서버 무관).
    await walletAdd(tx, input.userId, z.serverId, executorGain);
    await tx
      .update(guilds)
      .set({ taxPoolDiamond: sql`${guilds.taxPoolDiamond} + ${guildGain}` })
      .where(eq(guilds.id, z.owner));
    await tx
      .update(zones)
      .set({ taxDiamond: 0n, lastTaxCollectedAt: sql`now()` })
      .where(eq(zones.id, input.zoneId));

    // 활동 로그 — 길드 풀로 들어간 몫(90%+) 기준 기록.
    await logGuildAudit(tx, {
      serverId: z.serverId,
      guildId: z.owner,
      actorUserId: input.userId,
      action: 'tax_collect',
      detail: { amount: guildGain.toString(), zoneId: input.zoneId },
    });

    return { executorGain, guildGain };
  });
}
