import 'server-only';

import { randomInt } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guilds, guildMembers, guildTaxDistributions, guildAuditLog } from '@/lib/db/schema/guild';
import { mailbox } from '@/lib/db/schema/mailbox';
import { characters } from '@/lib/db/schema/server';

import { GuildError } from './errors';
import { assertGuildPerm } from './perm-guard';
import type { GuildRole } from './permissions';
import { type BoxParts, taxMailBody } from './tax-mail';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 분배 지급 = 보상 우편(2026-07-16 문의 반영) — 지갑 직접 입금은 수령 인지가 불가능했음.
 *  수령형 우편(첨부 💎)이라 우편함 빨간 점·홈 배지로 알림까지 해결. 만료 30일(기본). */
async function sendTaxMails(
  tx: Tx,
  serverId: number,
  meta: { guildName: string; actorRole: GuildRole; actorNick: string | null },
  rows: { userId: string; amount: bigint; boxes?: BoxParts | null }[],
): Promise<void> {
  if (rows.length === 0) return;
  await tx.insert(mailbox).values(
    rows.map((r) => ({
      userId: r.userId,
      serverId,
      type: 'reward' as const,
      title: '길드 세금 분배',
      body: taxMailBody(meta.guildName, meta.actorRole, meta.actorNick, r.amount, r.boxes),
      senderLabel: '길드',
      // 💎와 부위별 상자를 한 통에(10-11 통합). 상자가 없으면 boxes를 싣지 않는다(옛 우편과 같은 모양).
      payload: r.boxes ? { diamond: Number(r.amount), boxes: r.boxes } : { diamond: Number(r.amount) },
    })),
  );
}

/**
 * 한 사람 몫의 상자 n개를 부위로 나눈다(10-10 결정) — 3의 배수는 무기·방어구·장신구에 똑같이, 나머지 1~2개는 무작위 부위(2개면 서로 다른 부위).
 * 난수는 서버에서만(CLAUDE §3.1). 테스트는 rng를 주입한다.
 */
export function splitBoxes(n: number, rng: (max: number) => number = (max) => randomInt(max)): BoxParts {
  const base = Math.floor(n / 3);
  const parts: BoxParts = { weapon: base, armor: base, accessory: base };
  const slots: (keyof BoxParts)[] = ['weapon', 'armor', 'accessory'];
  let rest = n - base * 3;
  while (rest > 0) {
    const i = rng(slots.length);
    parts[slots[i]!] += 1;
    slots.splice(i, 1);
    rest -= 1;
  }
  return parts;
}

/** 분배 우편 문구용 — 길드명 + 분배한 사람의 직책·닉네임(캐릭터 행이 없으면 직책만 적는다). */
async function guildMailMeta(tx: Tx, guildId: bigint, actorUserId: string, serverId: number, actorRole: GuildRole) {
  const [g] = await tx.select({ name: guilds.name }).from(guilds).where(eq(guilds.id, guildId)).limit(1);
  const [c] = await tx
    .select({ nick: characters.nickname })
    .from(characters)
    .where(and(eq(characters.userId, actorUserId), eq(characters.serverId, serverId)))
    .limit(1);
  return { guildName: g?.name ?? '길드', actorRole, actorNick: c?.nick ?? null };
}

/**
 * 길드 세금 수동 분배 — 분배 권한자. 길드원별 지정 💎와 📦(10-11 통합: 월드보스 전리품 상자가 세금 📦에 쌓인다)를
 * 한 트랜잭션에서 지급하고 총액만큼 세금 💎·📦를 차감한다. 잔여는 세금에 남는다. 상자는 1개부터(부위 배분은 splitBoxes).
 * 지급 = 보상 우편 한 통(💎 + 부위별 상자). 분배 페이지(입력란)에서 사용.
 */
export function distributeGuildTaxManual(input: {
  leaderUserId: string;
  serverId: number;
  amounts: { userId: string; amount: number; boxes?: number }[];
}): Promise<{ total: bigint; totalBoxes: number }> {
  return db.transaction(async (tx) => {
    const leader = await assertGuildPerm(tx, input.leaderUserId, input.serverId, 'taxDistribute');
    const gid = leader.guildId;

    // 거대 배열 루프 비용 방어(감사 LOW) — 정원보다 큰 입력은 잘라냄. 양수·정수만, 같은 유저 합산.
    const byUser = new Map<string, { amount: bigint; boxes: number }>();
    for (const a of input.amounts.slice(0, 100)) {
      const amt = Math.max(0, Math.floor(Number(a.amount)) || 0);
      const bx = Math.max(0, Math.floor(Number(a.boxes ?? 0)) || 0);
      if (amt <= 0 && bx <= 0) continue;
      const cur = byUser.get(a.userId) ?? { amount: 0n, boxes: 0 };
      byUser.set(a.userId, { amount: cur.amount + BigInt(amt), boxes: cur.boxes + bx });
    }
    if (byUser.size === 0) throw new GuildError('NOTHING_TO_DISTRIBUTE');
    const total = [...byUser.values()].reduce((s, v) => s + v.amount, 0n);
    const totalBoxes = [...byUser.values()].reduce((s, v) => s + v.boxes, 0);

    const [g] = await tx
      .select({ pool: guilds.taxPoolDiamond, boxes: guilds.taxPoolBoxes })
      .from(guilds)
      .where(eq(guilds.id, gid))
      .for('update');
    if (total > g!.pool || totalBoxes > g!.boxes) throw new GuildError('DISTRIBUTE_OVER_POOL');

    // 모든 대상이 길드원인지 검증.
    const memberRows = await tx
      .select({ u: guildMembers.userId })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, gid));
    const memberSet = new Set(memberRows.map((r) => r.u));
    for (const uid of byUser.keys()) if (!memberSet.has(uid)) throw new GuildError('TARGET_NOT_IN_GUILD');

    const metaMan = await guildMailMeta(tx, gid, input.leaderUserId, input.serverId, leader.role);
    const rows = [...byUser].map(([uid, v]) => ({ userId: uid, amount: v.amount, boxes: v.boxes > 0 ? splitBoxes(v.boxes) : null }));
    await sendTaxMails(tx, input.serverId, metaMan, rows);
    await tx
      .update(guilds)
      .set({ taxPoolDiamond: sql`${guilds.taxPoolDiamond} - ${total}`, taxPoolBoxes: sql`${guilds.taxPoolBoxes} - ${totalBoxes}` })
      .where(eq(guilds.id, gid));
    await tx.insert(guildTaxDistributions).values({
      guildId: gid,
      byUserId: input.leaderUserId,
      mode: 'manual',
      total,
      boxes: totalBoxes,
    });
    // 활동 로그 — 지정 금액 받은 수령자 1인당 1줄. 직렬 insert → 단일 multi-row(감사 G-05).
    await tx.insert(guildAuditLog).values(
      rows.map((r) => ({
        serverId: input.serverId,
        guildId: gid,
        actorUserId: input.leaderUserId,
        action: 'tax_distribute' as const,
        targetUserId: r.userId,
        detail: r.boxes ? { amount: r.amount.toString(), boxes: r.boxes.weapon + r.boxes.armor + r.boxes.accessory, parts: r.boxes, mode: 'manual' } : { amount: r.amount.toString(), mode: 'manual' },
      })),
    );
    return { total, totalBoxes };
  });
}
