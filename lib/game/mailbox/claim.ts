import 'server-only';

import { and, count, eq, gt, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { userProfiles } from '@/lib/db/schema/avatar';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { mailbox, mailClaimLogs } from '@/lib/db/schema/mailbox';
import { SUPPLY_SLOTS, type SupplySlot } from '@/lib/game/balance';

/** 아바타 보유 캡 — profile/actions.ts(생성 차단)와 동일. 초과 시 수령 차단. */
const MAX_PROFILES = 20;

/**
 * 우편함 수령 — SCHEMA §7. 비동기 보상(레이드 정산·오프라인 강화 결과 등) 지급.
 * payload: { diamond?, boxes?: { weapon?, armor?, accessory? } }.
 * 멱등: claimed_at is null 조건부. 다이아/보급상자 지급 + claimed_at 기록 = 단일 tx.
 */
export type MailPayload = {
  diamond?: number;
  boxes?: Partial<Record<SupplySlot, number>>;
  /** 아바타 증정(대난투 우승 트로피 등) — 수령 시 userProfiles 추가(캡 MAX_PROFILES). */
  avatarGrant?: { rotations: Record<string, string>; characterId: string };
};
export type ClaimResult = {
  diamond: number;
  boxes: Record<SupplySlot, number>;
  /** 아바타가 목록에 추가됐는지(우승 트로피 등). */
  avatarAdded?: boolean;
};

export class MailError extends Error {
  constructor(public code: 'MAIL_NOT_FOUND' | 'AVATAR_FULL') {
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
    // 아바타 증정 — 캡 체크 후 userProfiles 추가(활성 전환은 안 함, 목록에만 추가).
    if (payload.avatarGrant) {
      const [pc] = await tx
        .select({ n: count() })
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId));
      if ((pc?.n ?? 0) >= MAX_PROFILES) throw new MailError('AVATAR_FULL');
      await tx.insert(userProfiles).values({
        userId,
        rotations: payload.avatarGrant.rotations,
        activeDirection: 'south',
        pixellabCharacterId: payload.avatarGrant.characterId,
        options: { source: 'melee_champion' },
        equipmentSnapshot: {},
        descriptionPrompt: '대난투 우승 트로피 아바타',
      });
      acc.avatarAdded = true;
    }
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

    const acc = emptyResult();
    for (const m of rows) {
      // 아바타 증정은 보유 캡 때문에 '모두 받기'에서 제외 — 개별 수령만.
      if ((m.payload as MailPayload).avatarGrant) continue;
      const before = { diamond: acc.diamond, boxes: { ...acc.boxes } };
      await applyPayload(tx, userId, m.payload as MailPayload, acc);
      await tx.update(mailbox).set({ claimedAt: new Date() }).where(eq(mailbox.id, m.id));
      await tx.insert(mailClaimLogs).values({
        mailId: m.id,
        userId,
        diamondGranted: BigInt(acc.diamond - before.diamond),
        boxesGranted: {
          weapon: acc.boxes.weapon - before.boxes.weapon,
          armor: acc.boxes.armor - before.boxes.armor,
          accessory: acc.boxes.accessory - before.boxes.accessory,
        },
      });
    }
    return acc;
  });
}
