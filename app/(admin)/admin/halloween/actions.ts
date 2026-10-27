'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth/require-admin';
import { HALLOWEEN_ACCRUE_END_LABEL } from '@/lib/game/halloween/config';
import { settleContest } from '@/lib/game/halloween/contest';

export type SettleState = { ok: true; already: boolean; rows: number; mails: number; titles: number } | { ok: false; message: string };

/** 할로윈 강화 대회 정산(11/4 오후) — 마감 시각 기준 최종 순위 확정 → 우편·칭호 지급. 서버당 한 번(멱등). */
export async function settleHalloweenAction(serverId: number): Promise<SettleState> {
  const adminId = await requireAdmin();
  const sid = Math.floor(Number(serverId));
  if (!Number.isInteger(sid) || sid < 1) return { ok: false, message: '서버 번호가 잘못됐어요.' };
  try {
    const r = await settleContest(sid, adminId);
    if (!r.ok) return { ok: false, message: `아직 대회가 끝나지 않았어요. 마감(${HALLOWEEN_ACCRUE_END_LABEL}) 뒤에 정산할 수 있습니다.` };
    revalidatePath('/admin/halloween');
    revalidatePath('/event/halloween');
    return r;
  } catch (e) {
    console.error('[admin.halloween.settle]', e);
    return { ok: false, message: '정산 중 오류가 났어요. 로그를 확인해 주세요.' };
  }
}
