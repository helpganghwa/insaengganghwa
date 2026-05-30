import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';
import { catalogItems, equipmentInstances, type Slot } from '@/lib/db/schema/equipment';
import { profileGenerationJobs } from '@/lib/db/schema/avatar';
import { PROFILE_GENERATION_DIAMOND } from '@/lib/game/balance';

import { CreateProfileForm } from './CreateProfileForm';

export default async function CreateProfilePage() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 빈 결과로 degrade(2026-05-29).
  const _r = await withTimeout(
    Promise.all([
    db
      .select({ diamond: profiles.diamond })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
    db
      .select({
        slot: catalogItems.slot,
        code: catalogItems.code,
        name: catalogItems.name,
        transcendLevel: equipmentInstances.transcendLevel,
      })
      .from(equipmentInstances)
      .innerJoin(catalogItems, eq(equipmentInstances.catalogItemId, catalogItems.id))
      .where(
        and(eq(equipmentInstances.userId, userId), isNotNull(equipmentInstances.equippedSlot)),
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
      <header className="flex items-center gap-2">
        <h1 className="text-lg font-bold">프로필 생성</h1>
      </header>

      <p className="text-xs leading-relaxed text-zinc-500">
        성별을 고르면 현재 장착한 장비 3종의 컨셉을 녹여 캐릭터를 생성해요. 생성 후 자동 검토를
        거쳐 통과하면 프로필 목록에 추가돼요.
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
