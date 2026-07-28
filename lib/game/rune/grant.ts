import 'server-only';

import { db } from '@/lib/db/client';
import { runes } from '@/lib/db/schema/rune';
import { rollAvatarAttrs } from '@/lib/game/balance';
import { runeNameFor } from './name';

// drizzle 트랜잭션 핸들 — 아바타 생성 tx 안에서 함께 지급(부분 실패 없음, §3.3).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 룬 지급 — 아바타 생성 1건당 1개(§10 서버 RNG 롤). source_profile_id unique로 멱등
 * (재시도·백필 이중지급 방지 — 충돌 시 무시). 아바타 생성 tx 내에서 호출.
 */
export async function grantRuneForProfile(
  tx: Tx,
  input: { userId: string; serverId: number; profileId: string },
): Promise<void> {
  const attrs = rollAvatarAttrs();
  await tx
    .insert(runes)
    .values({
      userId: input.userId,
      serverId: input.serverId,
      attrs,
      name: runeNameFor(attrs),
      sourceProfileId: input.profileId,
    })
    .onConflictDoNothing();
}
