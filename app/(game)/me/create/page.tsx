import Link from 'next/link';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { catalogItems, equipmentInstances, type Slot } from '@/lib/db/schema/equipment';
import { profileGenerationJobs } from '@/lib/db/schema/avatar';
import { PROFILE_GENERATION_DIAMOND } from '@/lib/game/balance';

import { CreateProfileForm } from './CreateProfileForm';

export default async function CreateProfilePage() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const [prof, equipped, activeJobs] = await Promise.all([
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
  ]);

  const bySlot = new Map(equipped.map((e) => [e.slot, e]));
  const equippedSlots = (['weapon', 'armor', 'accessory'] as Slot[]).map((s) => {
    const it = bySlot.get(s);
    return it ? { slot: s, code: it.code, name: it.name, transcendLevel: it.transcendLevel } : { slot: s, code: null, name: null, transcendLevel: 0 };
  });

  const activeJob = activeJobs[0] ?? null;

  return (
    <div className="space-y-4 px-4 py-6">
      <header className="flex items-center gap-2">
        <Link href="/me" aria-label="뒤로" className="text-zinc-400">
          ‹
        </Link>
        <h1 className="text-lg font-bold">프로필 생성</h1>
      </header>

      <p className="text-xs leading-relaxed text-zinc-500">
        성별만 고르면 현재 장착한 장비 3종의 컨셉을 녹여 캐릭터를 생성해요. 표정·머리·종족은
        랜덤으로 부여되어 매번 다른 개성이 나옵니다. 생성 후 자동 검토를 거쳐 통과하면 프로필
        목록에 추가돼요.
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
