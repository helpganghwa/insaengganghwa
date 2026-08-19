/**
 * 순위 y축 범위·눈금 — **1등이 항상 맨 위 라벨**이고 **소수 눈금은 나오지 않게** 못 박는다.
 *
 * 배경(2026-08-19, 헤드리스 렌더로 실측):
 *  · `min: 1 + minInterval: 1`만 주면 ECharts가 눈금을 2·4·6…으로 잡아 **1등 라벨이 사라진다**
 *    (1~2등 → `#2`만, 1~10등 → `#2 #4 #6 #8`, 3~40등 → `#10 #20 #30`).
 *  · 더 나쁜 건 `min`이 하한을 **보장하지 않는다**는 점이다. 데이터가 전부 1등이고 interval을
 *    주면 축이 아래로 벌어져 `#0.5 #1.5`가 찍힌다 — 1등보다 위에 0.5등이 생기는 그 증상이다.
 *
 * 그래서 nice 계산에 맡기지 않고 min·max·interval을 **셋 다 정수로 직접 지정**한다.
 * 눈금은 1, 1+k, 1+2k … 로 떨어지므로 1등이 반드시 남고 소수도 원천적으로 안 생긴다.
 * 눈금 수는 최대 5개 — 130px 높이에서 라벨이 겹치지 않는 선이다.
 */
export function rankAxisRange(
  ranks: readonly (number | null | undefined)[],
): { min: 1; max: number; interval: number } {
  const valid = ranks.filter(
    (r): r is number => typeof r === 'number' && Number.isFinite(r) && r >= 1,
  );
  // 축이 한 점으로 눌리면 ECharts가 임의로 벌린다 — 최소 2등까지는 항상 그린다.
  const top = Math.max(2, ...(valid.length ? valid : [2]));
  const interval = Math.max(1, Math.ceil((top - 1) / 4)); // 눈금 5개 이내
  const steps = Math.ceil((top - 1) / interval);
  return { min: 1, max: 1 + interval * steps, interval };
}
