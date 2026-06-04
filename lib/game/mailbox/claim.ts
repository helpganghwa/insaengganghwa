import 'server-only';

import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { mailbox, mailClaimLogs } from '@/lib/db/schema/mailbox';
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
export type ClaimResult = {
  diamond: number;
  boxes: Record<SupplySlot, number>;
};

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

/** v1 갱신 — 만료(expires_at > now()) 체크 + mail_claim_logs 감사 insert. */
export function claimMail(input: { userId: string; mailId: bigint }): Promise<ClaimResult> {
  const { userId, mailId } = input;
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select({ id: mailbox.id, payload: mailbox.payload })
      .from(mailbox)
      .where(
        and(
          eq(mailbox.id, mailId),
          eq(mailbox.userId, userId),
          isNull(mailbox.claimedAt),
          gt(mailbox.expiresAt, sql`now()`),
        ),
      )
      .for('update');
    if (!m) throw new MailError('MAIL_NOT_FOUND'); // 이미 수령 / 만료 / 본인 아님

    const payload = m.payload as MailPayload;
    const acc = emptyResult();
    await applyPayload(tx, userId, payload, acc);
    await tx.update(mailbox).set({ claimedAt: new Date() }).where(eq(mailbox.id, mailId));
    // 감사 — diamond/boxes 분배 결과 기록(mailbox cron 삭제 후에도 추적 가능).
    await tx.insert(mailClaimLogs).values({
      mailId,
      userId,
      diamondGranted: BigInt(acc.diamond),
      boxesGranted: acc.boxes,
    });
    return acc;
  });
}

export function claimAllMail(input: { userId: string }): Promise<ClaimResult> {
  const { userId } = input;
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: mailbox.id, payload: mailbox.payload })
      .from(mailbox)
      .where(
        and(
          eq(mailbox.userId, userId),
          isNull(mailbox.claimedAt),
          gt(mailbox.expiresAt, sql`now()`),
        ),
      )
      .for('update');

    if (rows.length === 0) return emptyResult();

    // N+1 제거: 메일별 4쿼리 → 합산 후 일괄. 메일별 지급액은 mailClaimLogs로 보존(감사),
    // 자원 반영(다이아 +, 슬롯 박스 +)은 합산해 1회씩만. claimed_at도 inArray로 일괄 마킹.
    const total = emptyResult();
    const claimedAt = new Date();
    const logValues = rows.map((m) => {
      const p = (m.payload as MailPayload | null) ?? {};
      const d = p.diamond && p.diamond > 0 ? p.diamond : 0;
      const b = {
        weapon: p.boxes?.weapon ?? 0,
        armor: p.boxes?.armor ?? 0,
        accessory: p.boxes?.accessory ?? 0,
      };
      total.diamond += d;
      total.boxes.weapon += b.weapon;
      total.boxes.armor += b.armor;
      total.boxes.accessory += b.accessory;
      return { mailId: m.id, userId, diamondGranted: BigInt(d), boxesGranted: b };
    });

    if (total.diamond > 0) {
      await tx
        .update(profiles)
        .set({ diamond: sql`${profiles.diamond} + ${BigInt(total.diamond)}` })
        .where(eq(profiles.id, userId));
    }
    for (const slot of SUPPLY_SLOTS) {
      const n = total.boxes[slot];
      if (n > 0) {
        await tx
          .insert(userSupplyBoxes)
          .values({ userId, slot, count: BigInt(n) })
          .onConflictDoUpdate({
            target: [userSupplyBoxes.userId, userSupplyBoxes.slot],
            set: { count: sql`${userSupplyBoxes.count} + ${BigInt(n)}` },
          });
      }
    }
    await tx
      .update(mailbox)
      .set({ claimedAt })
      .where(
        inArray(
          mailbox.id,
          rows.map((r) => r.id),
        ),
      );
    await tx.insert(mailClaimLogs).values(logValues);

    return total;
  });
}
