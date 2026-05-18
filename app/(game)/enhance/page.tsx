import Link from 'next/link';
import { and, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { catalogItems, equipmentInstances, type Slot } from '@/lib/db/schema/equipment';
import { enhancementJobs } from '@/lib/db/schema/enhance';

import { EnhanceSlotCard, type ActiveJob } from './EnhanceSlotCard';

const SLOTS: Slot[] = ['weapon', 'armor', 'accessory'];
const LANES = [1, 2] as const;
const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

export default async function EnhancePage() {
  const userId = await getSessionUserId();
  if (!userId) return null; // (game) layout이 가드

  const [jobs, profRow] = await Promise.all([
    db
      .select({
        jobId: enhancementJobs.id,
        equipmentInstanceId: enhancementJobs.equipmentInstanceId,
        slot: enhancementJobs.slot,
        slotLane: enhancementJobs.slotLane,
        fromLevel: enhancementJobs.fromLevel,
        targetLevel: enhancementJobs.targetLevel,
        baseRateBp: enhancementJobs.baseRateBp,
        startedAt: enhancementJobs.startedAt,
        completeAt: enhancementJobs.completeAt,
        transcendLevel: equipmentInstances.transcendLevel,
        name: catalogItems.name,
      })
      .from(enhancementJobs)
      .innerJoin(equipmentInstances, eq(enhancementJobs.equipmentInstanceId, equipmentInstances.id))
      .innerJoin(catalogItems, eq(equipmentInstances.catalogItemId, catalogItems.id))
      .where(and(eq(enhancementJobs.userId, userId), eq(enhancementJobs.status, 'running'))),
    db
      .select({ diamond: profiles.diamond, nickname: profiles.nickname })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
  ]);

  const diamond = profRow[0]?.diamond ?? 0n;
  const nickname = profRow[0]?.nickname ?? '플레이어';
  const byLane = new Map<string, (typeof jobs)[number]>();
  for (const j of jobs) byLane.set(`${j.slot}:${j.slotLane}`, j);

  return (
    <div className="space-y-5 px-4 py-4">
      {SLOTS.map((slot) => (
        <section key={slot} className="space-y-2">
          <h2 className="text-xs font-semibold text-zinc-500">{SLOT_LABEL[slot]}</h2>
          {LANES.map((lane) => {
            const j = byLane.get(`${slot}:${lane}`);
            const active: ActiveJob | null = j
              ? {
                  jobId: j.jobId.toString(),
                  name: j.name,
                  slot: j.slot,
                  fromLevel: j.fromLevel,
                  targetLevel: j.targetLevel,
                  transcendLevel: j.transcendLevel,
                  baseRateBp: j.baseRateBp,
                  startedAtIso: j.startedAt.toISOString(),
                  completeAtIso: j.completeAt.toISOString(),
                }
              : null;
            return active ? (
              <EnhanceSlotCard
                key={lane}
                activeJob={active}
                diamond={diamond.toString()}
                nickname={nickname}
              />
            ) : (
              <Link
                key={lane}
                href={`/inventory?slot=${slot}`}
                className="flex h-[92px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 text-sm text-zinc-500 transition hover:border-amber-400 hover:bg-amber-50/40 dark:border-zinc-700 dark:hover:border-amber-700 dark:hover:bg-amber-950/20"
              >
                <span className="text-lg">＋</span> {SLOT_LABEL[slot]} 올려 강화
              </Link>
            );
          })}
        </section>
      ))}
    </div>
  );
}
