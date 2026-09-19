import 'server-only';

import { createHash } from 'node:crypto';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { historyEraSummaries, type HistoryEraSummaryRow } from '@/lib/db/schema/guild';

import { eraSyncDecision } from './era-sync-decision';
import { narrateEraUncached, type EraFacts, type EraNarrative } from './era-summary';

/**
 * 시대 요약 저장소(0202·0203) — 역사 페이지에 나가는 정본(summary·closing)은 운영자만 바꾼다.
 *  - 읽기: 역사 페이지가 시작일로 찾는다. 테이블·권한이 없으면(마이그레이션 적용 전, 읽기 전용 역할) 빈 결과.
 *  - 동기화(크론·어드민): 사실표가 바뀐 시대에 이야기꾼 **제안**을 쌓는다(proposed_*). 정본은 건드리지 않는다.
 *    처음 보는 시대는 집계 문장을 정본으로 넣어 두고 제안을 함께 단다. locked 행은 제안도 받지 않는다.
 *  - 적용·버림·수정 저장은 어드민(/admin/history-eras)에서만.
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

/** 적용을 기다리는 제안 수(어드민 허브 배지). 0203 적용 전이면 0. */
export async function countPendingEraProposals(): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(historyEraSummaries)
    .where(isNotNull(historyEraSummaries.proposedSummary))
    .catch(() => [{ n: 0 }]);
  return rows[0]?.n ?? 0;
}

export type SyncResult = { proposed: number; skipped: number; failed: number; locked: number };

/** 사실표가 바뀐 시대에만 제안을 만든다. force면 잠기지 않은 시대 전부에 새 제안. */
export async function syncEraSummaries(serverId: number, inputs: EraInput[], opts: { force?: boolean; only?: string } = {}): Promise<SyncResult> {
  const stored = await readStoredEraSummaries(serverId);
  const out: SyncResult = { proposed: 0, skipped: 0, failed: 0, locked: 0 };
  for (const { facts, fallback, guildId } of inputs) {
    if (opts.only && opts.only !== facts.from) continue;
    const row = stored.get(facts.from);
    const hash = factsHash(facts);
    const key = and(eq(historyEraSummaries.serverId, serverId), eq(historyEraSummaries.startKstDay, facts.from));
    // 기간·진행 여부는 글이 아니라 시대의 뼈대라 제안과 무관하게 맞춰 둔다.
    if (row && (String(row.endKstDay).slice(0, 10) !== facts.to || row.ongoing !== facts.ongoing || row.guildId !== guildId)) {
      await db.update(historyEraSummaries).set({ endKstDay: facts.to, ongoing: facts.ongoing, guildId }).where(key);
    }
    const decision = eraSyncDecision(row ?? null, hash, opts.force === true);
    if (decision === 'locked') {
      out.locked += 1;
      continue;
    }
    if (decision === 'skip') {
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
    else out.proposed += 1;
    const proposal = text
      ? { proposedSummary: text.summary, proposedClosing: text.closing, proposedFactsHash: hash, proposedAt: new Date() }
      : null;
    if (!row) {
      // 처음 보는 시대 — 검수 전까지는 집계 문장이 나간다. 생성이 실패했으면 source='code'라 다음 동기화가 다시 시도한다.
      await db
        .insert(historyEraSummaries)
        .values({
          serverId,
          startKstDay: facts.from,
          guildId,
          endKstDay: facts.to,
          ongoing: facts.ongoing,
          factsHash: hash,
          summary: fallback.summary,
          closing: fallback.closing,
          source: 'code',
          locked: false,
          ...(proposal ?? {}),
        })
        .onConflictDoNothing();
    } else if (proposal) {
      await db.update(historyEraSummaries).set(proposal).where(key);
    }
  }
  return out;
}

export type ApplyResult = 'ok' | 'NO_PROPOSAL';

/** 제안 적용 — 제안 글이 정본이 되고, 그 사실표 해시를 정본의 해시로 삼는다. */
export async function applyEraProposal(serverId: number, startKstDay: string): Promise<ApplyResult> {
  const rows = await db
    .update(historyEraSummaries)
    .set({
      summary: sql`${historyEraSummaries.proposedSummary}`,
      closing: sql`coalesce(${historyEraSummaries.proposedClosing}, '')`,
      factsHash: sql`coalesce(${historyEraSummaries.proposedFactsHash}, ${historyEraSummaries.factsHash})`,
      source: 'ai',
      proposedSummary: null,
      proposedClosing: null,
      proposedFactsHash: null,
      proposedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(historyEraSummaries.serverId, serverId),
        eq(historyEraSummaries.startKstDay, startKstDay),
        isNotNull(historyEraSummaries.proposedSummary),
      ),
    )
    .returning({ day: historyEraSummaries.startKstDay });
  return rows.length > 0 ? 'ok' : 'NO_PROPOSAL';
}

/** 제안 버림 — 글만 지우고 해시는 남겨, 같은 사실표로 다시 제안하지 않게 한다(사실표가 바뀌면 새 제안이 온다). */
export async function dismissEraProposal(serverId: number, startKstDay: string): Promise<void> {
  await db
    .update(historyEraSummaries)
    .set({ proposedSummary: null, proposedClosing: null, proposedAt: null })
    .where(and(eq(historyEraSummaries.serverId, serverId), eq(historyEraSummaries.startKstDay, startKstDay)));
}

/**
 * 운영자 수정 저장. 기다리던 제안이 있었다면 그 사실표까지 보고 쓴 글로 쳐서 제안을 닫는다(해시 승계).
 * 잠그지 않는다 — 정본은 크론이 건드리지 못하므로, 잠그면 진행 중인 시대에 제안이 끊길 뿐이다.
 */
export async function saveEraSummaryManual(serverId: number, startKstDay: string, summary: string, closing: string): Promise<void> {
  await db
    .update(historyEraSummaries)
    .set({
      summary,
      closing,
      source: 'manual',
      factsHash: sql`coalesce(${historyEraSummaries.proposedFactsHash}, ${historyEraSummaries.factsHash})`,
      proposedSummary: null,
      proposedClosing: null,
      proposedFactsHash: null,
      proposedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(historyEraSummaries.serverId, serverId), eq(historyEraSummaries.startKstDay, startKstDay)));
}

export async function setEraSummaryLocked(serverId: number, startKstDay: string, locked: boolean): Promise<void> {
  await db
    .update(historyEraSummaries)
    .set({ locked, updatedAt: new Date() })
    .where(and(eq(historyEraSummaries.serverId, serverId), eq(historyEraSummaries.startKstDay, startKstDay)));
}
