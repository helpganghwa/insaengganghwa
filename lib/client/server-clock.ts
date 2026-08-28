/**
 * 서버 시계 보정(2026-08-28) — 클라 표시·완료 판정은 서버가 준 timestamp를 클라 Date.now()와 비교하므로
 * 폰 시계가 어긋나면 "100%·강화 가능"이 서버 판정과 달라진다. 페이지가 렌더 시각(ISO)을 내려주면 offset을 잡아
 * serverNow()로 계산한다. 네트워크 지연만큼 offset이 음수로 치우쳐(클라가 서버보다 뒤라고 봄) 안전한 방향.
 */
let offsetMs = 0;
export function setServerNow(iso: string): void {
  const t = Date.parse(iso);
  if (Number.isFinite(t)) offsetMs = t - Date.now();
}
export function clockOffsetMs(): number {
  return offsetMs;
}
export function serverNow(): number {
  return Date.now() + offsetMs;
}
