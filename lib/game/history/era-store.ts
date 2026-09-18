import 'server-only';

import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { historyEraSummaries, type HistoryEraSummaryRow } from '@/lib/db/schema/guild';

import { narrateEraUncached, type EraFacts, type EraNarrative } from './era-summary';

/**
 * 시대 요약 저장소(0202, 2026-09-18) — 이야기꾼 문장을 DB에 두고 운영자가 통제한다.
 *  - 읽기: 역사 페이지가 시작일로 찾는다. 테이블·권한이 없으면(프로덕션 0202 적용 전, 읽기 전용 역할) 빈 결과.
 *  - 동기화(크론·어드민): 사실표 해시가 바뀐 시대만 다시 생성. locked 행은 건드리지 않는다.
 *  - 수동 저장: locked=true·source=manual.
 */
export type EraInput = { facts: EraFacts; fallback: EraNarrative; guildId: number };

export function factsHash(f: EraFacts): string {
  return createHash('sha1').update(JSON.stringify(f)).digest('hex').slice(0, 20);
}

export async function readStoredEraSummaries(serverId: number): Promise<Map<string, HistoryEraSummaryRow>> {
  const rows = await db
    .select()
    .from(historyEraSummaries)
    .where(eq(historyEraSummaries.serverId, serverId))
    .catch(() => [] as HistoryEraSummaryRow[]);
  return new Map(rows.map((r) => [String(r.startKstDay).slice(0, 10), r]));
}

export type SyncResult = { generated: number; skipped: number; failed: number; locked: number };

/** 사실표가 바뀐 시대만 생성해 저장. force면 잠기지 않은 행을 전부 다시 만든다. */
export async function syncEraSummaries(serverId: number, inputs: EraInput[], opts: { force?: boolean; only?: string } = {}): Promise<SyncResult> {
  const stored = await readStoredEraSummaries(serverId);
  const out: SyncResult = { generated: 0, skipped: 0, failed: 0, locked: 0 };
  for (const { facts, fallback, guildId } of inputs) {
    if (opts.only && opts.only !== facts.from) continue;
    const row = stored.get(facts.from);
    const hash = factsHash(facts);
    if (row?.locked) {
      out.locked += 1;
      continue;
    }
    // 사실표가 그대로여도 source='code'(직전 생성 실패로 집계 문장이 들어간 행)는 다시 시도한다 —
    // 건너뛰면 끝난 시대는 사실표가 더는 안 바뀌어 실패한 문장이 영영 남는다(09-18 점검).
    if (row && row.factsHash === hash && row.source !== 'code' && !opts.force) {
      out.skipped += 1;
      continue;
    }
    let text: EraNarrative | null = null;
    try {
      text = await narrateEraUncached(facts);
    } catch (e) {
      console.warn('[history.era] 생성 실패:', (e as Error).message);
    }
    if (!text) out.failed += 1;
    else out.generated += 1;
    const final = text ?? fallback;
    await db
      .insert(historyEraSummaries)
      .values({
        serverId,
        startKstDay: facts.from,
        guildId,
        endKstDay: facts.to,
        ongoing: facts.ongoing,
        factsHash: hash,
        summary: final.summary,
        closing: final.closing,
        source: text ? 'ai' : 'code',
        locked: false,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [historyEraSummaries.serverId, historyEraSummaries.startKstDay],
        set: {
          guildId,
          endKstDay: facts.to,
          ongoing: facts.ongoing,
          factsHash: hash,
          summary: final.summary,
          closing: final.closing,
          source: text ? 'ai' : 'code',
          updatedAt: new Date(),
        },
      });
  }
  return out;
}

/** 운영자 저장 — 잠근다(크론이 덮어쓰지 않음). */
export async function saveEraSummaryManual(serverId: number, startKstDay: string, summary: string, closing: string): Promise<void> {
  await db
    .update(historyEraSummaries)
    .set({ summary, closing, source: 'manual', locked: true, updatedAt: new Date() })
    .where(and(eq(historyEraSummaries.serverId, serverId), eq(historyEraSummaries.startKstDay, startKstDay)));
}

export async function setEraSummaryLocked(serverId: number, startKstDay: string, locked: boolean): Promise<void> {
  await db
    .update(historyEraSummaries)
    .set({ locked, updatedAt: new Date() })
    .where(and(eq(historyEraSummaries.serverId, serverId), eq(historyEraSummaries.startKstDay, startKstDay)));
}
