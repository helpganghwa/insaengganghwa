import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { cronHeartbeats } from '@/lib/db/schema/ops';

/**
 * 크론 dead-man — 각 크론이 성공 완료 시 beatCron으로 last_success_at을 갱신하고,
 * warm 워치독·어드민 대시보드가 크론별 허용 간격(아래) 초과를 정지로 감지한다.
 * 크론이 던지거나(에러) 안 돌아도(CRON_SECRET 사고) beat가 안 와 자동 감지된다.
 *
 * 허용 간격 = "이 시간 안에 한 번은 성공했어야 한다"(스케줄 주기 × 여유 + 창 기반 크론은 하루+).
 * vercel.json 스케줄과 1:1로 맞춘다. 여기 없는 name은 감시 대상 아님.
 */
const MIN = 60_000;
const HOUR = 60 * MIN;
// 감시 대상 = 정지 시 실사용/매출 영향이 있는 핵심 크론만. 총체적 정지(CRON_SECRET 사고)는
// 고빈도 크론(≤40분) 아무거나 stale로 잡히고, 개별 중요 크론도 각자 감지된다. 여기 계측한
// 크론만 beatCron을 호출한다(미계측 크론을 넣으면 항상 stale 오탐).
export const CRON_MAX_GAP_MS: Record<string, number> = {
  warm: 5 * MIN, // 매분 — 워치독 본체
  'push-enhance-ready': 10 * MIN, // 매분
  'profile-poll': 12 * MIN, // 2분 — 아바타 발주 백스톱
  'push-flush': 20 * MIN, // 5분
  'settle-raid': 20 * MIN, // 5분 — 레이드 정산
  'payment-recon': 40 * MIN, // 10분 — 결제 백스톱(최중요)
  'push-daily-supply': 17 * HOUR, // UTC15~23:30 창(창 밖 최대공백 ~15.5h)
  'melee-run': 25 * HOUR, // UTC0 창 — 대난투 개최
  'conquest-run': 25 * HOUR, // UTC14 창 — 점령전 정산
};

/**
 * 크론 성공 하트비트 — best-effort(실패해도 크론 본작업엔 영향 없음). 회복 시 stale 알림 리셋.
 * 크론 성공 return 직전에 `await beatCron('name', 요약)` 한 줄로 호출한다.
 */
export async function beatCron(name: string, detail?: string): Promise<void> {
  try {
    await db
      .insert(cronHeartbeats)
      .values({ name, detail: detail ?? null })
      .onConflictDoUpdate({
        target: cronHeartbeats.name,
        set: { lastSuccessAt: sql`now()`, detail: detail ?? null, staleAlertedAt: null },
      });
  } catch (e) {
    console.warn('[cron.heartbeat] beat failed', name, (e as Error).message);
  }
}

export type StaleCron = { name: string; lastSuccessAt: Date | null; ageMs: number; alerted: boolean };

/**
 * 정지 크론 목록 — CRON_MAX_GAP_MS 기준 초과(또는 하트비트 행 자체가 없음=한 번도 성공 안 함).
 * 어드민 대시보드(수동 확인)와 warm 워치독(능동 알림) 공용.
 */
export async function getStaleCrons(nowMs: number): Promise<StaleCron[]> {
  const rows = (await db
    .select({
      name: cronHeartbeats.name,
      lastSuccessAt: cronHeartbeats.lastSuccessAt,
      staleAlertedAt: cronHeartbeats.staleAlertedAt,
    })
    .from(cronHeartbeats)) as {
    name: string;
    lastSuccessAt: Date;
    staleAlertedAt: Date | null;
  }[];
  const byName = new Map(rows.map((r) => [r.name, r]));
  const stale: StaleCron[] = [];
  for (const [name, maxGap] of Object.entries(CRON_MAX_GAP_MS)) {
    const row = byName.get(name);
    const last = row?.lastSuccessAt ?? null;
    const ageMs = last ? nowMs - last.getTime() : Infinity;
    if (ageMs > maxGap) {
      stale.push({ name, lastSuccessAt: last, ageMs, alerted: row?.staleAlertedAt != null });
    }
  }
  return stale;
}

/** warm 워치독 알림 디듀프 — 정지 크론에 알림 시각 마킹(1시간 1회). */
export async function markStaleAlerted(names: string[]): Promise<void> {
  if (names.length === 0) return;
  try {
    // 행이 없던(한 번도 안 돈) 크론도 마킹할 수 있게 upsert. lastSuccessAt은 epoch로 두어
    // 여전히 정지로 잡히게 한다(now()로 올리면 안 됨).
    for (const name of names) {
      await db
        .insert(cronHeartbeats)
        .values({ name, lastSuccessAt: new Date(0), staleAlertedAt: sql`now()` })
        .onConflictDoUpdate({
          target: cronHeartbeats.name,
          set: { staleAlertedAt: sql`now()` },
        });
    }
  } catch (e) {
    console.warn('[cron.heartbeat] markStaleAlerted failed', (e as Error).message);
  }
}
