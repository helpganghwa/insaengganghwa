'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth/require-admin';
import type { MeleeHeadlinePick, MeleeHeadlines } from '@/lib/db/schema/melee';
import { generateAndStoreMeleeHeadlines, saveMeleeHeadlinePicks } from '@/lib/game/melee/headline-service';
import { runMelee } from '@/lib/game/melee/run';
import { kstDateString } from '@/lib/kst';

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

/**
 * 배틀 재실행(2026-09-03) — 오늘 배틀이 발표 전(computed)일 때 참가자·배틀 행을 지우고 새 시드로 다시
 * 돌린 뒤 헤드라인을 새로 만든다. 우승자·순위·보상이 바뀌는 운영 개입이라 클라이언트가 2단계 확인을 둔다.
 * runMelee는 항상 KST 오늘로 돌기 때문에 오늘 카드에서만 허용한다.
 */
export async function rerunMeleeBattleAction(input: {
  serverId: number;
  battleDate: string;
}): Promise<Result<{ participants: number; headlineCandidates: number }>> {
  await requireAdmin();
  if (!DATE_RE.test(input.battleDate)) return { status: 'error', message: '날짜 형식 오류' };
  if (input.battleDate !== kstDateString()) return { status: 'error', message: '오늘 배틀만 다시 돌릴 수 있습니다' };
  const serverId = Number(input.serverId);
  try {
    const r = await runMelee(serverId, { rerun: { seedSalt: `r${Date.now().toString(36)}` } });
    if (!r.ran) {
      const message =
        r.reason === 'NOT_REPLACEABLE'
          ? '발표 전(산출됨) 상태의 오늘 배틀만 다시 돌릴 수 있습니다'
          : r.reason === 'TOO_FEW'
            ? '참가 자격자가 2명 미만이라 다시 돌리지 못했습니다'
            : '다른 산출과 겹쳐 취소했습니다. 화면을 새로고침한 뒤 다시 시도하세요';
      return { status: 'error', message };
    }
    // 새 배틀 행은 headlines가 비어 있으므로 force 없이도 새로 만들어진다. 실패해도 재실행 자체는 성공.
    const h = await generateAndStoreMeleeHeadlines(serverId, input.battleDate).catch(() => null);
    revalidatePath('/admin/preview');
    return { status: 'success', data: { participants: r.participants, headlineCandidates: h?.ok ? h.headlines.candidates.length : 0 } };
  } catch (e) {
    console.error('[melee.rerun]', e);
    const race = e instanceof Error && e.message === 'MELEE_RERUN_RACE';
    return { status: 'error', message: race ? '그 사이 발표가 시작돼 취소했습니다' : '다시 돌리는 중 오류가 발생했습니다. 배틀은 그대로입니다' };
  }
}
