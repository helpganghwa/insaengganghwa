import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { getWalletDiamond } from '@/lib/game/wallet';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { catalogItems, userEquipment, type Slot } from '@/lib/db/schema/equipment';
import { profileGenerationJobs } from '@/lib/db/schema/avatar';
import { PROFILE_GENERATION_DIAMOND } from '@/lib/game/balance';

import { CreateProfileForm } from './CreateProfileForm';

export default async function CreateProfilePage() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const serverId = await getActiveServerId();

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 빈 결과로 degrade(2026-05-29).
  const _r = await withTimeout(
    Promise.all([
    getWalletDiamond(db, userId, serverId).then((d) => [{ diamond: d }]),
    db
      .select({
        slot: catalogItems.slot,
        code: catalogItems.code,
        name: catalogItems.name,
        transcendLevel: userEquipment.transcendLevel,
      })
      .from(userEquipment)
      .innerJoin(catalogItems, eq(userEquipment.catalogItemId, catalogItems.id))
      .where(
        and(
          eq(userEquipment.userId, userId),
          eq(userEquipment.serverId, serverId),
          isNotNull(userEquipment.equippedSlot),
        ),
      ),
    db
      .select({
        status: profileGenerationJobs.status,
        createdAt: profileGenerationJobs.createdAt,
      })
      .from(profileGenerationJobs)
      .where(
        and(
          eq(profileGenerationJobs.userId, userId),
          inArray(profileGenerationJobs.status, ['queued', 'downloading', 'ai_reviewing']),
        ),
      )
      .limit(1),
    ]),
    3500,
    'me.create.page',
  ).catch(() => null);
  const prof = _r?.[0] ?? [];
  const equipped = _r?.[1] ?? [];
  const activeJobs = _r?.[2] ?? [];

  const bySlot = new Map(equipped.map((e) => [e.slot, e]));
  const equippedSlots = (['weapon', 'armor', 'accessory'] as Slot[]).map((s) => {
    const it = bySlot.get(s);
    return it ? { slot: s, code: it.code, name: it.name, transcendLevel: it.transcendLevel } : { slot: s, code: null, name: null, transcendLevel: 0 };
  });

  const activeJob = activeJobs[0] ?? null;

  return (
    <div className="space-y-4 px-4 py-6">
      <p className="text-xs leading-relaxed text-zinc-500">
        성별을 고르면 현재 장착한 장비 3종의 컨셉을 녹여 캐릭터를 생성해요. 생성 후 자동 검토를
        거쳐 통과하면 아바타 목록에 추가돼요.
      </p>

      <CreateProfileForm
        diamond={String(prof[0]?.diamond ?? 0n)}
        price={PROFILE_GENERATION_DIAMOND}
        equipped={equippedSlots}
        activeJob={
          activeJob
            ? { status: activeJob.status, createdAt: activeJob.createdAt?.toISOString() ?? null }
            : null
        }
      />
    </div>
  );
}
