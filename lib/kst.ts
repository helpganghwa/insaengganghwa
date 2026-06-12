/**
 * KST(Asia/Seoul, UTC+9, DST 없음) 변환 헬퍼 — CLAUDE §3.8.
 *
 * DB는 UTC `timestamptz`. 일일/월간 비즈니스 경계(보급 상자 충전·레이드 일일 한도·
 * 출석체크·미성년 월 한도)는 **KST 기준**으로만 계산. UTC 자정으로 직접 다루지 말 것.
 * 순수 함수 — env/DB 무관.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 주어진 시각의 KST 벽시계 구성요소(연/월/일). */
function kstParts(at: Date = new Date()): { y: number; m: number; d: number } {
  const k = new Date(at.getTime() + KST_OFFSET_MS);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate() };
}

/** KST 자정의 UTC 인스턴트 (일일 리셋 기준점). */
export function kstStartOfDay(at: Date = new Date()): Date {
  const { y, m, d } = kstParts(at);
  // KST 00:00 == UTC 전날/당일 (offset 보정).
  return new Date(Date.UTC(y, m - 1, d) - KST_OFFSET_MS);
}

/** `YYYY-MM-DD` (KST) — raid_daily_counts 등 일자 키. */
export function kstDateString(at: Date = new Date()): string {
  const { y, m, d } = kstParts(at);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** KST 벽시계 시(0~23) — 점령전 23:00 잠금 등 시각 분기. */
export function kstHour(at: Date = new Date()): number {
  return new Date(at.getTime() + KST_OFFSET_MS).getUTCHours();
}

/** `YYYYMM` (KST) — monthly_purchase_limits 키 (미성년 월 한도). */
export function kstMonthString(at: Date = new Date()): string {
  const { y, m } = kstParts(at);
  return `${y}${String(m).padStart(2, '0')}`;
}

/** 다음 KST 자정까지 남은 ms (일일 충전 카운트다운 UI). */
export function msUntilNextKstMidnight(at: Date = new Date()): number {
  const next = kstStartOfDay(at).getTime() + 24 * 60 * 60 * 1000;
  return Math.max(0, next - at.getTime());
}
