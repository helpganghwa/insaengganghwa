import { and, desc, eq, isNull } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { catalogItems, equipmentInstances, type Slot } from '@/lib/db/schema/equipment';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { championCatalogIds } from '@/lib/game/codex/ranking';

import { EnhanceSlotCard, type ActiveJob } from './EnhanceSlotCard';
import { EmptySlotButton, type EnhanceCandidate } from './EnhanceSlotPicker';

const SLOTS: Slot[] = ['weapon', 'armor', 'accessory'];
const LANES = [1, 2] as const;
const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

export default async function EnhancePage() {
  const userId = await getSessionUserId();
  if (!userId) return null; // (game) layout이 가드

  const [jobs, profRow, champSet, candidatesRaw] = await Promise.all([
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
        catalogItemId: equipmentInstances.catalogItemId,
        code: catalogItems.code,
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
    championCatalogIds(userId),
    // 강화 가능 후보: 잠금 X, 진행 중 X. equipped 무관(equippedSlot 포함).
    // LEFT JOIN status='running' ej → ej.id IS NULL 로 진행 중 제외.
    db
      .select({
        id: equipmentInstances.id,
        catalogItemId: equipmentInstances.catalogItemId,
        enhanceLevel: equipmentInstances.enhanceLevel,
        transcendLevel: equipmentInstances.transcendLevel,
        equippedSlot: equipmentInstances.equippedSlot,
        code: catalogItems.code,
        name: catalogItems.name,
        slot: catalogItems.slot,
      })
      .from(equipmentInstances)
      .innerJoin(catalogItems, eq(equipmentInstances.catalogItemId, catalogItems.id))
      .leftJoin(
        enhancementJobs,
        and(
          eq(enhancementJobs.equipmentInstanceId, equipmentInstances.id),
          eq(enhancementJobs.status, 'running'),
        ),
      )
      .where(
        and(
          eq(equipmentInstances.userId, userId),
          eq(equipmentInstances.isLocked, false),
          isNull(enhancementJobs.id),
        ),
      )
      .orderBy(desc(equipmentInstances.enhanceLevel), desc(equipmentInstances.acquiredAt)),
  ]);

  const diamond = profRow[0]?.diamond ?? 0n;
  const nickname = profRow[0]?.nickname ?? '플레이어';
  const byLane = new Map<string, (typeof jobs)[number]>();
  for (const j of jobs) byLane.set(`${j.slot}:${j.slotLane}`, j);

  // 후보를 slot별 그룹화 + champion 표식.
  const candidatesBySlot = new Map<Slot, EnhanceCandidate[]>();
  for (const s of SLOTS) candidatesBySlot.set(s, []);
  for (const c of candidatesRaw) {
    candidatesBySlot.get(c.slot)!.push({
      id: c.id.toString(),
      code: c.code,
      name: c.name,
      slot: c.slot,
      enhanceLevel: c.enhanceLevel,
      transcendLevel: c.transcendLevel,
      isChampion: champSet.has(c.catalogItemId),
      equipped: c.equippedSlot !== null,
    });
  }

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
                  code: j.code,
                  name: j.name,
                  slot: j.slot,
                  fromLevel: j.fromLevel,
                  targetLevel: j.targetLevel,
                  transcendLevel: j.transcendLevel,
                  isChampion: champSet.has(j.catalogItemId),
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
              <EmptySlotButton
                key={lane}
                slot={slot}
                candidates={candidatesBySlot.get(slot) ?? []}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
