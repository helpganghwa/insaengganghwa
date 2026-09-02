'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth/require-admin';
import type { MeleeHeadlinePick, MeleeHeadlines } from '@/lib/db/schema/melee';
import { generateAndStoreMeleeHeadlines, saveMeleeHeadlinePicks } from '@/lib/game/melee/headline-service';

type Result<T = void> = ({ status: 'success' } & (T extends void ? object : { data: T })) | { status: 'error'; message: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 헤드라인 생성/재생성 — force면 운영자 수정분까지 버리고 규칙 엔진으로 다시 만든다. */
export async function generateMeleeHeadlinesAction(input: {
  serverId: number;
  battleDate: string;
  force?: boolean;
}): Promise<Result<MeleeHeadlines>> {
  await requireAdmin();
  if (!DATE_RE.test(input.battleDate)) return { status: 'error', message: '날짜 형식 오류' };
  const r = await generateAndStoreMeleeHeadlines(Number(input.serverId), input.battleDate, { force: !!input.force });
  if (!r.ok) return { status: 'error', message: r.reason === 'NO_BATTLE' ? '그 날짜의 배틀이 없습니다' : '아직 산출되지 않은 배틀입니다' };
  revalidatePath('/admin/preview');
  return { status: 'success', data: r.headlines };
}

/** 선택 저장 — 최대 4줄, 80자, 빈 줄 불가(서비스가 재검증). */
export async function saveMeleeHeadlinesAction(input: {
  serverId: number;
  battleDate: string;
  picks: MeleeHeadlinePick[];
}): Promise<Result> {
  await requireAdmin();
  if (!DATE_RE.test(input.battleDate)) return { status: 'error', message: '날짜 형식 오류' };
  const r = await saveMeleeHeadlinePicks(Number(input.serverId), input.battleDate, input.picks);
  if (!r.ok) {
    const msg = r.reason === 'INVALID' ? '4줄 이하, 한 줄 80자 이하로 맞춰 주세요' : r.reason === 'NOT_GENERATED' ? '먼저 생성해 주세요' : '배틀이 없습니다';
    return { status: 'error', message: msg };
  }
  revalidatePath('/admin/preview');
  return { status: 'success' };
}
