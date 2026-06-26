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
 * 점령전 진행(잠금) 윈도 여부 — KST 23:00~00:59(정산 23시 + 공개·소유권이전 00시). 배치/집행관
 * 등록·해제 금지.
 *  - 23시: conquest-run 정산 cron 중 배치 변경 차단 → 결정론 스냅샷 보호.
 *  - 00시(감사 G-03): conquest-chronicle reveal이 zones.owner_guild_id를 플립하는 윈도. 잠그지
 *    않으면 배치가 소유권 플립과 경합해 stale ownership로 attack/defend가 검증되는 TOCTOU 발생.
 */
export function isConquestLocked(at: Date = new Date()): boolean {
  const h = kstHour(at);
  return h === CONQUEST_BATTLE_KST_HOUR || h === (CONQUEST_BATTLE_KST_HOUR + 1) % 24;
}
