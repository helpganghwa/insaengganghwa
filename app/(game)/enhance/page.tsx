import { and, desc, eq, isNull } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';
import { catalogItems, equipmentInstances, type Slot } from '@/lib/db/schema/equipment';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { championCatalogIds } from '@/lib/game/codex/ranking';

import { type ActiveJob } from './EnhanceSlotCard';
import { type EnhanceCandidate } from './EnhanceSlotPicker';
import { SlotLane } from './SlotLane';
import { PushPermissionPrompt } from '@/components/PushPermissionPrompt';

const SLOTS: Slot[] = ['weapon', 'armor', 'accessory'];
const LANES = [1, 2] as const;
const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

export default async function EnhancePage() {
  const userId = await getSessionUserId();
  if (!userId) return null; // (game) layout이 가드

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 빈 결과로 degrade(2026-05-29).
  const _r = await withTimeout(
    Promise.all([
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
    ]),
    3500,
    'enhance.page',
  ).catch(() => null);
  const jobs = _r?.[0] ?? [];
  const profRow = _r?.[1] ?? [];
  const champSet = _r?.[2] ?? new Set<number>();
  const candidatesRaw = _r?.[3] ?? [];

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

  // 진행 중 강화 큐가 1개 이상이면 푸시 권한 contextual prompt 노출(첫 진입 시).
  // 이미 권한 있음/거부/7일 dismiss 윈도는 컴포넌트가 자체 가드.
  const hasRunningJob = jobs.length > 0;

  return (
    <div className="space-y-5 px-4 py-4">
      <PushPermissionPrompt trigger={hasRunningJob} />
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
            return (
              <SlotLane
                key={lane}
                initialActive={active}
                candidates={candidatesBySlot.get(slot) ?? []}
                slot={slot}
                diamond={diamond.toString()}
                nickname={nickname}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
