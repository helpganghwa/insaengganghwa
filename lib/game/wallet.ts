import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { recordDiamondLedger, type LedgerDb, type LedgerReason } from '@/lib/game/ledger';

/** db 또는 트랜잭션 핸들 — 원자성(다른 상태 변경과의 묶음)은 호출자 트랜잭션 책임. */
export type WalletDb = LedgerDb;

/**
 * 서버별 다이아 지갑(SERVER.md §1) — characters.diamond 단일 경로.
 * 모든 증감은 이 헬퍼로만(profiles.diamond는 동결). 잔액 검증은 조건부 UPDATE라 락 불필요.
 *
 * 증감은 여기서 diamond_ledger에 기록한다 — 호출부에 맡기면 언젠가 빠지고, 그때는 사고가
 * 난 뒤에야 알게 된다. 그래서 reason은 **필수 인자**(누락 호출부는 타입 에러로 드러난다).
 * 기록은 호출자가 넘긴 dbx로 — 지갑 변경과 같은 트랜잭션이라 롤백 시 함께 사라진다.
 */

/** 지갑 잔액 — 캐릭터 행 없으면 0n(헤더 표시 등 읽기 전용). */
export async function getWalletDiamond(dbx: WalletDb, userId: string, serverId: number): Promise<bigint> {
  const [r] = await dbx
    .select({ d: characters.diamond })
    .from(characters)
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
    .limit(1);
  return r?.d ?? 0n;
}

/** 지급(증가) — 캐릭터 행은 가입 트리거/백필로 보장. 부재 시 조용한 유실 대신 명시 실패(tx 롤백). */
export async function walletAdd(
  dbx: WalletDb,
  userId: string,
  serverId: number,
  amount: bigint | number,
  reason: LedgerReason,
  ref?: string,
): Promise<void> {
  const amt = BigInt(amount);
  const rows = await dbx
    .update(characters)
    .set({ diamond: sql`${characters.diamond} + ${amt}` })
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
    .returning({ userId: characters.userId });
  if (rows.length === 0) throw new Error(`WALLET_CHARACTER_MISSING:${userId}@s${serverId}`);
  await recordDiamondLedger(dbx, { userId, serverId, delta: amt, reason, ref });
}

/** 조건부 차감 — 잔액 부족(캐릭터 없음 포함)이면 false·차감 없음. 성공 시 true. */
export async function walletTrySpend(
  dbx: WalletDb,
  userId: string,
  serverId: number,
  amount: bigint | number,
  reason: LedgerReason,
  ref?: string,
): Promise<boolean> {
  const amt = BigInt(amount);
  // 방어심화 — 음수면 조건(diamond >= 음수)이 항상 참이라 차감이 지급으로 반전된다.
  // 현재 전 호출부가 서버 권위 상수/검증값이라 악용 경로는 없지만 불변식으로 고정.
  // (0은 합법 — 길드 문양 첫 시도 등 무료 비용이 no-op 차감으로 통과해야 한다.)
  if (amt < 0n) throw new Error(`WALLET_NEGATIVE_AMOUNT:${amt}`);
  const rows = await dbx
    .update(characters)
    .set({ diamond: sql`${characters.diamond} - ${amt}` })
    .where(
      and(
        eq(characters.userId, userId),
        eq(characters.serverId, serverId),
        sql`${characters.diamond} >= ${amt}`,
      ),
    )
    .returning({ userId: characters.userId });
  // 차감에 성공했을 때만 기록 — 잔액 부족(false)은 실제 변동이 없었으므로 원장에 남기지 않는다.
  if (rows.length > 0) {
    await recordDiamondLedger(dbx, { userId, serverId, delta: -amt, reason, ref });
  }
  return rows.length > 0;
}

/**
 * 환불 회수 — 결제 취소 시 지급분 되돌리기. 이미 소비한 분은 회수 불가라 **0까지만** 깎는다
 * (음수 잔액은 UI·차감 불변식을 깬다). 잠금 후 읽고 줄이므로 실제 회수액이 확정되고,
 * 그 값만 원장에 남는다(명목액을 기록하면 회수하지 못한 몫까지 회수된 것으로 보인다).
 * 반환값 = 실제 회수액. 캐릭터 행이 없으면 회수할 것도 없으므로 0(walletAdd와 달리 throw 안 함).
 */
export async function walletReclaim(
  dbx: WalletDb,
  userId: string,
  serverId: number,
  amount: bigint | number,
  reason: LedgerReason,
  ref?: string,
): Promise<bigint> {
  const amt = BigInt(amount);
  if (amt <= 0n) return 0n;
  const [cur] = await dbx
    .select({ d: characters.diamond })
    .from(characters)
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
    .for('update')
    .limit(1);
  if (!cur) return 0n;
  const taken = cur.d < amt ? cur.d : amt;
  if (taken <= 0n) return 0n;
  await dbx
    .update(characters)
    .set({ diamond: sql`${characters.diamond} - ${taken}` })
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)));
  await recordDiamondLedger(dbx, { userId, serverId, delta: -taken, reason, ref });
  return taken;
}
