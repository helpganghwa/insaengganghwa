import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** db 또는 트랜잭션 핸들 — 원자성(다른 상태 변경과의 묶음)은 호출자 트랜잭션 책임. */
export type WalletDb = typeof db | Tx;

/**
 * 서버별 다이아 지갑(SERVER.md §1) — characters.diamond 단일 경로.
 * 모든 증감은 이 헬퍼로만(profiles.diamond는 동결). 잔액 검증은 조건부 UPDATE라 락 불필요.
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

/** 지급(증가) — 캐릭터 행 없으면 생성(가입 트리거 밖 경로 안전망). */
export async function walletAdd(
  dbx: WalletDb,
  userId: string,
  serverId: number,
  amount: bigint | number,
): Promise<void> {
  const amt = BigInt(amount);
  await dbx
    .insert(characters)
    .values({ userId, serverId, diamond: amt })
    .onConflictDoUpdate({
      target: [characters.userId, characters.serverId],
      set: { diamond: sql`${characters.diamond} + ${amt}` },
    });
}

/** 조건부 차감 — 잔액 부족(캐릭터 없음 포함)이면 false·차감 없음. 성공 시 true. */
export async function walletTrySpend(
  dbx: WalletDb,
  userId: string,
  serverId: number,
  amount: bigint | number,
): Promise<boolean> {
  const amt = BigInt(amount);
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
  return rows.length > 0;
}
