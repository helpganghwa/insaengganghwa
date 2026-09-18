'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { adminActions } from '@/lib/db/schema/ops';
import { saveEraSummaryManual, setEraSummaryLocked } from '@/lib/game/history/era-store';
import { syncHistoryEras } from '@/lib/game/history/loaders';

type Result = { status: 'success'; note?: string } | { status: 'error'; code: string };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 전체 동기화 — 바뀐 시대만 다시 생성(잠긴 것 제외). force면 잠기지 않은 전부. */
export async function syncErasAction(serverId: number, force = false): Promise<Result> {
  await requireAdmin();
  try {
    const r = await syncHistoryEras(serverId, { force });
    revalidatePath('/admin/history-eras');
    return { status: 'success', note: `생성 ${r.generated} · 유지 ${r.skipped} · 잠김 ${r.locked} · 실패 ${r.failed}` };
  } catch (e) {
    return { status: 'error', code: (e as Error).message.slice(0, 120) };
  }
}

/** 한 시대만 다시 생성 — 잠겨 있으면 먼저 풀어야 한다. */
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

/** 운영자 수정 저장 — 잠금(크론이 덮어쓰지 않음). 조치 원장에 남긴다. */
export async function saveEraAction(serverId: number, startKstDay: string, summary: string, closing: string): Promise<Result> {
  const adminUserId = await requireAdmin();
  if (!DAY_RE.test(startKstDay)) return { status: 'error', code: 'BAD_DAY' };
  const s = summary.trim();
  const c = closing.trim();
  if (s.length < 20 || s.length > 800) return { status: 'error', code: 'SUMMARY_LENGTH' };
  if (c.length > 300) return { status: 'error', code: 'CLOSING_LENGTH' };
  await saveEraSummaryManual(serverId, startKstDay, s, c);
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
