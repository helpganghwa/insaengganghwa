import 'server-only';

import { db } from '@/lib/db/client';
import { runes } from '@/lib/db/schema/rune';
import { rollAvatarAttrs } from '@/lib/game/balance';
import { attrRegionOfItemKey } from '@/lib/game/attr/item-region';
import { runeNameFor } from './name';

/** 아바타 생성 시 착용 스냅샷(user_profiles.equipment_snapshot / job.equipment_snapshot). */
export type EquipSnapshot = {
  weaponKey?: string | null;
  armorKey?: string | null;
  accessoryKey?: string | null;
};

// drizzle 트랜잭션 핸들 — 아바타 생성 tx 안에서 함께 지급(부분 실패 없음, §3.3).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 속성 각인 — 아바타 생성 1건당 1개(§10). **지역은 착용 아이템이 정하고 수치만 롤**한다.
 * 스냅샷이 없거나 '일반' 아이템뿐이면 속성 없는 아바타가 된다(정상 — 기본 아바타 등).
 * source_profile_id unique로 멱등(재시도·백필 이중지급 방지 — 충돌 시 무시).
 */
export async function grantRuneForProfile(
  tx: Tx,
  input: { userId: string; serverId: number; profileId: string; equipment?: EquipSnapshot | null },
): Promise<void> {
  const eq = input.equipment ?? {};
  const attrs = rollAvatarAttrs({
    weapon: attrRegionOfItemKey(eq.weaponKey),
    armor: attrRegionOfItemKey(eq.armorKey),
    accessory: attrRegionOfItemKey(eq.accessoryKey),
  });
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
