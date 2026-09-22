/** 남은 시간 표기 — `N일 HH:MM:SS` / `HH:MM:SS`(1일 미만). 홈 배너와 이벤트 페이지 헤더가 같은 형식을 쓴다. */
export function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const hh = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return d > 0 ? `${d}일 ${hh}` : hh;
}
