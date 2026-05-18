import 'server-only';

import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { mailbox } from '@/lib/db/schema/mailbox';
import { SUPPLY_SLOTS, type SupplySlot } from '@/lib/game/balance';

/**
 * 우편함 수령 — SCHEMA §7. 비동기 보상(레이드 정산·오프라인 강화 결과 등) 지급.
 * payload: { diamond?, boxes?: { weapon?, armor?, accessory? } }.
 * 멱등: claimed_at is null 조건부. 다이아/보급상자 지급 + claimed_at 기록 = 단일 tx.
 */
export type MailPayload = {
  diamond?: number;
  boxes?: Partial<Record<SupplySlot, number>>;
};
export type ClaimResult = { diamond: number; boxes: Record<SupplySlot, number> };

export class MailError extends Error {
  constructor(public code: 'MAIL_NOT_FOUND') {
    super(code);
    this.name = 'MailError';
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function applyPayload(tx: Tx, userId: string, p: MailPayload, acc: ClaimResult) {
  if (p.diamond && p.diamond > 0) {
    await tx
      .update(profiles)
      .set({ diamond: sql`${profiles.diamond} + ${BigInt(p.diamond)}` })
      .where(eq(profiles.id, userId));
    acc.diamond += p.diamond;
  }
  for (const slot of SUPPLY_SLOTS) {
    const n = p.boxes?.[slot] ?? 0;
    if (n > 0) {
      await tx
        .insert(userSupplyBoxes)
        .values({ userId, slot, count: BigInt(n) })
        .onConflictDoUpdate({
          target: [userSupplyBoxes.userId, userSupplyBoxes.slot],
          set: { count: sql`${userSupplyBoxes.count} + ${BigInt(n)}` },
        });
      acc.boxes[slot] += n;
    }
  }
}

const emptyResult = (): ClaimResult => ({
  diamond: 0,
  boxes: { weapon: 0, armor: 0, accessory: 0 },
});

export function claimMail(input: { userId: string; mailId: bigint }): Promise<ClaimResult> {
  const { userId, mailId } = input;
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select({ id: mailbox.id, payload: mailbox.payload })
      .from(mailbox)
      .where(and(eq(mailbox.id, mailId), eq(mailbox.userId, userId), isNull(mailbox.claimedAt)))
      .for('update');
    if (!m) throw new MailError('MAIL_NOT_FOUND');

    const acc = emptyResult();
    await applyPayload(tx, userId, m.payload as MailPayload, acc);
    await tx.update(mailbox).set({ claimedAt: new Date() }).where(eq(mailbox.id, mailId));
    return acc;
  });
}

export function claimAllMail(input: { userId: string }): Promise<ClaimResult> {
  const { userId } = input;
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: mailbox.id, payload: mailbox.payload })
      .from(mailbox)
      .where(and(eq(mailbox.userId, userId), isNull(mailbox.claimedAt)))
      .for('update');

    const acc = emptyResult();
    for (const m of rows) {
      await applyPayload(tx, userId, m.payload as MailPayload, acc);
      await tx.update(mailbox).set({ claimedAt: new Date() }).where(eq(mailbox.id, m.id));
    }
    return acc;
  });
}
