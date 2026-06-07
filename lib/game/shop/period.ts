import { kstDateString, kstMonthString } from '@/lib/kst';

/**
 * 상점 주기 리셋 키(KST) — 같은 키 = 같은 주기(이미 처리).
 *  - daily : 'YYYY-MM-DD' (KST 자정 리셋)
 *  - weekly: 'W<그 주 월요일>' (월요일 초기화)
 *  - monthly: 'YYYY-MM' (매달 1일 초기화)
 */
export type ResetPeriod = 'daily' | 'weekly' | 'monthly';

export function periodKey(p: ResetPeriod): string {
  if (p === 'daily') return kstDateString();
  if (p === 'monthly') return kstMonthString();
  const ds = kstDateString();
  const dt = new Date(`${ds}T00:00:00Z`);
  const dow = (dt.getUTCDay() + 6) % 7; // Mon=0
  const monday = new Date(dt.getTime() - dow * 86_400_000);
  return `W${monday.toISOString().slice(0, 10)}`;
}
