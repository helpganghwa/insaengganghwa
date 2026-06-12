import { sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { type Slot } from '@/lib/db/schema/equipment';
import { liberatedItemRanks } from '@/lib/game/codex/ranking';
import { TUTORIAL_DONE } from '@/lib/game/tutorial';

import { type ActiveJob } from './EnhanceSlotCard';
import { type EnhanceCandidate } from './EnhanceSlotPicker';
import { SlotLane } from './SlotLane';
import { PushPermissionPrompt } from '@/components/PushPermissionPrompt';

const SLOTS: Slot[] = ['weapon', 'armor', 'accessory'];
const LANES = [1, 2] as const;
const SLOT_LABEL: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };

export default async function EnhancePage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) return null; // (game) layout이 가드

  // 진행중 강화 큐·프로필·강화후보를 **단일 SQL 1왕복**으로(json 동봉, catalog_items 조인 인라인).
  // 후보: status='running' LEFT JOIN으로 진행 중 제외(ej.id IS NULL). bigint id=text, 타임스탬프=
  // ISO 문자열. liberatedItemRanks(캐시)만 병렬 → 3 DB왕복 → 2. 콜드/hang 시 빈 결과 degrade.
  type EnhRow = {
    diamond: string | null;
    nickname: string | null;
    tutorial_step: number | null;
    jobs: {
      jobId: string;
      equipmentInstanceId: string;
      slot: Slot;
      slotLane: number;
      fromLevel: number;
      targetLevel: number;
      baseRateBp: number;
      startedAtIso: string;
      completeAtIso: string;
      transcendLevel: number;
      catalogItemId: number;
      code: string;
      name: string;
    }[];
    candidates: {
      id: string;
      catalogItemId: number;
      enhanceLevel: number;
      transcendLevel: number;
      equippedSlot: string | null;
      code: string;
      name: string;
      slot: Slot;
    }[];
  };
  const _r = await withTimeout(
    Promise.all([
      db.execute(sql`
        select
          c.diamond::text as diamond, p.nickname, c.tutorial_step,
          coalesce((select json_agg(json_build_object(
              'jobId', ej.id::text, 'equipmentInstanceId', ej.user_equipment_id::text,
              'slot', ej.slot, 'slotLane', ej.slot_lane, 'fromLevel', ej.from_level,
              'targetLevel', ej.target_level, 'baseRateBp', ej.base_rate_bp,
              'startedAtIso', ej.started_at, 'completeAtIso', ej.complete_at,
              'transcendLevel', ue.transcend_level, 'catalogItemId', ue.catalog_item_id,
              'code', ci.code, 'name', ci.name))
            from enhancement_jobs ej
            join user_equipment ue on ue.id = ej.user_equipment_id
            join catalog_items ci on ci.id = ue.catalog_item_id
            where ej.user_id = ${userId}::uuid and ej.status = 'running'), '[]'::json) as jobs,
          coalesce((select json_agg(json_build_object(
              'id', ue.id::text, 'catalogItemId', ue.catalog_item_id, 'enhanceLevel', ue.enhance_level,
              'transcendLevel', ue.transcend_level, 'equippedSlot', ue.equipped_slot,
              'code', ci.code, 'name', ci.name, 'slot', ci.slot)
              order by ue.enhance_level desc, ue.first_acquired_at desc)
            from user_equipment ue
            join catalog_items ci on ci.id = ue.catalog_item_id
            left join enhancement_jobs ej on ej.user_equipment_id = ue.id and ej.status = 'running'
            where ue.user_id = ${userId}::uuid and ej.id is null), '[]'::json) as candidates
        from profiles p
          left join characters c on c.user_id = p.id and c.server_id = ${serverId}
        where p.id = ${userId}::uuid limit 1
      `) as unknown as Promise<EnhRow[]>,
      liberatedItemRanks(userId),
    ]),
    3500,
    'enhance.page',
  ).catch(() => null);
  const row = _r?.[0]?.[0] ?? null;
  const libRanks = _r?.[1] ?? new Map<number, number>();
  const jobs = row?.jobs ?? [];
  const candidatesRaw = row?.candidates ?? [];

  const diamond = row?.diamond ?? '0';
  const nickname = row?.nickname ?? '플레이어';
  const byLane = new Map<string, (typeof jobs)[number]>();
  for (const j of jobs) byLane.set(`${j.slot}:${j.slotLane}`, j);

  // 후보를 slot별 그룹화 + champion 표식.
  const candidatesBySlot = new Map<Slot, EnhanceCandidate[]>();
  for (const s of SLOTS) candidatesBySlot.set(s, []);
  for (const c of candidatesRaw) {
    candidatesBySlot.get(c.slot)!.push({
      id: c.id,
      code: c.code,
      name: c.name,
      slot: c.slot,
      enhanceLevel: c.enhanceLevel,
      transcendLevel: c.transcendLevel,
      championRank: libRanks.get(c.catalogItemId) ?? null,
      equipped: c.equippedSlot !== null,
    });
  }

  // 진행 중 강화 큐가 1개 이상이면 푸시 권한 contextual prompt 노출(첫 진입 시).
  // 이미 권한 있음/거부/7일 dismiss 윈도는 컴포넌트가 자체 가드.
  // 단, 튜토리얼 진행 중엔 억제 — 마무리 팝업이 알림/설치를 따로 안내(충돌 방지).
  const tutorialDone = (row?.tutorial_step ?? TUTORIAL_DONE) === TUTORIAL_DONE;
  const hasRunningJob = jobs.length > 0 && tutorialDone;

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
                  jobId: j.jobId,
                  code: j.code,
                  name: j.name,
                  slot: j.slot,
                  fromLevel: j.fromLevel,
                  targetLevel: j.targetLevel,
                  transcendLevel: j.transcendLevel,
                  championRank: libRanks.get(j.catalogItemId) ?? null,
                  baseRateBp: j.baseRateBp,
                  startedAtIso: j.startedAtIso,
                  completeAtIso: j.completeAtIso,
                }
              : null;
            return (
              <SlotLane
                key={lane}
                initialActive={active}
                candidates={candidatesBySlot.get(slot) ?? []}
                slot={slot}
                diamond={diamond}
                nickname={nickname}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
