import { kstDateString, kstHour } from '@/lib/kst';

import { CONQUEST_BATTLE_KST_HOUR } from '../balance';

/**
 * 다음 점령전(매일 KST 23:00) 대상 날짜 'YYYY-MM-DD' — GUILD §5.8⑥.
 * 23:00 전이면 오늘 전투, 이후면 내일 전투. 배치는 항상 이 날짜로 귀속 → 23:00 잠금이 자연 구현
 * (23:00 지나면 오늘 배치는 동결되고 신규 배치는 내일로 롤). battle_kst_day는 서버가 결정(클라 불신).
 */
export function nextBattleKstDay(at: Date = new Date()): string {
  if (kstHour(at) < CONQUEST_BATTLE_KST_HOUR) return kstDateString(at);
  return kstDateString(new Date(at.getTime() + 24 * 60 * 60 * 1000));
}

/**
 * 점령전 진행(잠금) 윈도 여부 — KST 23:00~23:59. 이 시간대엔 배치/집행관 등록·해제 금지.
 * 23:00 정산 cron이 도는 한 시간이라, 정산 중 배치 변경을 막아 결정론 스냅샷을 보호한다.
 */
export function isConquestLocked(at: Date = new Date()): boolean {
  return kstHour(at) === CONQUEST_BATTLE_KST_HOUR;
}
