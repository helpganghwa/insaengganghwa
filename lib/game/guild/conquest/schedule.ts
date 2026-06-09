import { kstDateString, kstHour } from '@/lib/kst';

import { CONQUEST_BATTLE_KST_HOUR } from '../balance';

/**
 * 다음 점령전(매일 KST 12:00) 대상 날짜 'YYYY-MM-DD' — GUILD §5.8⑥.
 * 12:00 전이면 오늘 전투, 이후면 내일 전투. 배치는 항상 이 날짜로 귀속 → 12:00 잠금이 자연 구현
 * (12:00 지나면 오늘 배치는 동결되고 신규 배치는 내일로 롤). battle_kst_day는 서버가 결정(클라 불신).
 */
export function nextBattleKstDay(at: Date = new Date()): string {
  if (kstHour(at) < CONQUEST_BATTLE_KST_HOUR) return kstDateString(at);
  return kstDateString(new Date(at.getTime() + 24 * 60 * 60 * 1000));
}
