/**
 * 우편 수령 시각 표시(docs/MAIL.md §우편함 화면, 2026-10-13 제로 #RlFLazF5) — 순수 함수.
 * 7일 안은 상대 시간(방금 · N분 전 · N시간 전 · N일 전), 그 뒤는 `yyyy.MM.dd HH:mm`(기기 시간대).
 * 친구·길드원 목록의 접속 표시(components/LastSeen.tsx)와 같은 단위를 쓴다. 받은 우편은 30일 뒤 지워지므로 범위는 0~30일.
 */
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const CLAIMED_RELATIVE_MAX_MS = 7 * DAY;

const two = (n: number) => String(n).padStart(2, '0');

/** 절대 시각 `yyyy.MM.dd HH:mm` — 기기 시간대(이용자는 거의 KST). */
export function formatClaimedAbsolute(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

export function formatClaimedAt(claimedMs: number, nowMs: number): string {
  const diff = nowMs - claimedMs;
  if (diff < MIN) return '방금';
  if (diff < HOUR) return `${Math.floor(diff / MIN)}분 전`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}시간 전`;
  if (diff < CLAIMED_RELATIVE_MAX_MS) return `${Math.floor(diff / DAY)}일 전`;
  return formatClaimedAbsolute(claimedMs);
}
