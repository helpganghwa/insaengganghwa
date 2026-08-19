/**
 * 위키 수치 포맷터.
 *
 * 문서는 수치를 손으로 적지 않는다 — `lib/game/balance.ts` 상수를 **직접 import**해서
 * 이 포맷터로 렌더한다. 밸런스가 바뀌면 문서가 자동으로 따라가고, 공시(BALANCE.md)와
 * 어긋날 여지가 사라진다(CLAUDE §3.5 — 불일치는 게임산업법 §33 위험).
 *
 * ```tsx
 * // app/wiki/docs/enhance.tsx
 * import { baseSuccessRateBp, enhanceDurationMs, SAFE_MAX_LEVEL } from '@/lib/game/balance';
 * import { bpPct, fmtInt, fmtMs } from '../fmt';
 *
 * <P>
 *   +{fmtInt(SAFE_MAX_LEVEL)}까지는 하락이 없다. +10 시도는 {fmtMs(enhanceDurationMs(10))}가
 *   걸리고, 끝까지 기다렸을 때 성공 확률은 {bpPct(baseSuccessRateBp(10))}다.
 * </P>
 * ```
 */

const SEC = 1_000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * ms → "10초" / "10분" / "1시간 30분" / "2일 3시간".
 * 초는 분 미만 정밀도에서만 붙인다 — "2일 3시간 4분 5초"는 읽는 사람에게 정보가 아니다.
 */
export function fmtMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0초';
  const total = Math.round(ms / SEC);
  const d = Math.floor(total / (DAY / SEC));
  const h = Math.floor((total % (DAY / SEC)) / (HOUR / SEC));
  const m = Math.floor((total % (HOUR / SEC)) / (MIN / SEC));
  const s = total % (MIN / SEC);

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}일`);
  if (h > 0) parts.push(`${h}시간`);
  if (m > 0) parts.push(`${m}분`);
  if (s > 0 && d === 0 && h === 0) parts.push(`${s}초`);
  return parts.length > 0 ? parts.join(' ') : '0초';
}

/** bp(만분율, 10000 = 100%) → "95%" / "0.08%". 불필요한 소수점 0은 떨어뜨린다. */
export function bpPct(bp: number, maxFractionDigits = 2): string {
  if (!Number.isFinite(bp)) return '—';
  const pct = bp / 100;
  return `${Number(pct.toFixed(maxFractionDigits))}%`;
}

/**
 * 정수 천 단위 콤마. toLocaleString 대신 직접 끊는 이유: 런타임(Node/브라우저) ICU 차이로
 * SSR·CSR 결과가 갈릴 여지를 아예 없애기 위해서다.
 */
export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const v = Math.trunc(n);
  const sign = v < 0 ? '-' : '';
  return (
    sign +
    Math.abs(v)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  );
}
