/** 한국식 압축 표기 — 만/억. 전투력·다이아 등 큰 수 표시용. */
export function formatCompactKR(n: number | bigint): string {
  const v = typeof n === 'bigint' ? Number(n) : n;
  if (!Number.isFinite(v)) return '0';
  if (Math.abs(v) < 10_000) return Math.trunc(v).toLocaleString('ko-KR');
  if (Math.abs(v) < 1e8) {
    const m = v / 1e4;
    return `${(v % 1e4 === 0 ? m.toFixed(0) : m.toFixed(1)).replace(/\.0$/, '')}만`;
  }
  const e = v / 1e8;
  return `${(v % 1e8 === 0 ? e.toFixed(0) : e.toFixed(1)).replace(/\.0$/, '')}억`;
}
