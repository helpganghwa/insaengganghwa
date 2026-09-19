'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { adminActions } from '@/lib/db/schema/ops';
import { applyEraProposal, dismissEraProposal, saveEraSummaryManual, setEraSummaryLocked } from '@/lib/game/history/era-store';
import { syncHistoryEras } from '@/lib/game/history/loaders';

type Result = { status: 'success'; note?: string } | { status: 'error'; code: string };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 전체 동기화 — 사실표가 바뀐 시대에 이야기꾼 제안을 만든다(잠긴 것 제외, 정본은 그대로). force면 잠기지 않은 전부. */
export async function syncErasAction(serverId: number, force = false): Promise<Result> {
  await requireAdmin();
  try {
    const r = await syncHistoryEras(serverId, { force });
    revalidatePath('/admin/history-eras');
    return { status: 'success', note: `제안 ${r.proposed} · 유지 ${r.skipped} · 잠김 ${r.locked} · 실패 ${r.failed}` };
  } catch (e) {
    return { status: 'error', code: (e as Error).message.slice(0, 120) };
  }
}

/** 한 시대의 제안을 새로 받는다 — 잠겨 있으면 먼저 풀어야 한다. 정본은 [제안 적용]을 눌러야 바뀐다. */
export async function regenerateEraAction(serverId: number, startKstDay: string): Promise<Result> {
  await requireAdmin();
  if (!DAY_RE.test(startKstDay)) return { status: 'error', code: 'BAD_DAY' };
  try {
    const r = await syncHistoryEras(serverId, { force: true, only: startKstDay });
    revalidatePath('/admin/history-eras');
    if (r.locked > 0) return { status: 'error', code: 'LOCKED' };
    if (r.failed > 0) return { status: 'error', code: 'GENERATION_FAILED' };
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', code: (e as Error).message.slice(0, 120) };
  }
}

/** 운영자 수정 저장 — 기다리던 제안은 닫힌다. 조치 원장에 남긴다. */
export async function saveEraAction(serverId: number, startKstDay: string, summary: string, closing: string): Promise<Result> {
  const adminUserId = await requireAdmin();
  if (!DAY_RE.test(startKstDay)) return { status: 'error', code: 'BAD_DAY' };
  const s = summary.trim();
  const c = closing.trim();
  if (s.length < 20 || s.length > 800) return { status: 'error', code: 'SUMMARY_LENGTH' };
  if (c.length > 300) return { status: 'error', code: 'CLOSING_LENGTH' };
  const saved = await saveEraSummaryManual(serverId, startKstDay, s, c);
  if (saved !== 'ok') return { status: 'error', code: 'NO_ROW — 먼저 [바뀐 시대 제안 받기]로 행을 만드세요' };
  await db.insert(adminActions).values({
    adminUserId,
    action: 'history_era.save',
    targetType: 'history_era',
    targetId: `${serverId}:${startKstDay}`,
    payload: { summaryLen: s.length, closingLen: c.length },
  });
  revalidateTag('history-index', 'max');
  revalidatePath('/admin/history-eras');
  return { status: 'success' };
}

export async function lockEraAction(serverId: number, startKstDay: string, locked: boolean): Promise<Result> {
  await requireAdmin();
  if (!DAY_RE.test(startKstDay)) return { status: 'error', code: 'BAD_DAY' };
  await setEraSummaryLocked(serverId, startKstDay, locked);
  revalidatePath('/admin/history-eras');
  return { status: 'success' };
}

/** 이야기꾼 제안을 정본으로 — 역사 페이지에 바로 나간다. 조치 원장에 남긴다. */
export async function applyEraProposalAction(serverId: number, startKstDay: string): Promise<Result> {
  const adminUserId = await requireAdmin();
  if (!DAY_RE.test(startKstDay)) return { status: 'error', code: 'BAD_DAY' };
  const r = await applyEraProposal(serverId, startKstDay);
  if (r !== 'ok') return { status: 'error', code: r };
  await db.insert(adminActions).values({
    adminUserId,
    action: 'history_era.apply',
    targetType: 'history_era',
    targetId: `${serverId}:${startKstDay}`,
    payload: {},
  });
  revalidateTag('history-index', 'max');
  revalidatePath('/admin/history-eras');
  return { status: 'success' };
}

/** 제안 버림 — 정본은 그대로. 사실표가 다시 바뀌면 새 제안이 온다. */
export async function dismissEraProposalAction(serverId: number, startKstDay: string): Promise<Result> {
  await requireAdmin();
  if (!DAY_RE.test(startKstDay)) return { status: 'error', code: 'BAD_DAY' };
  await dismissEraProposal(serverId, startKstDay);
  revalidatePath('/admin/history-eras');
  return { status: 'success' };
}
