// 개인 기록 마일스톤 — 임계 계산(서버)·표시 라벨(클라 공용). 순수 함수만(server-only 금지).

/** 지표별 마일스톤 값 — 현재 값이 도달한 가장 높은 임계(미달 시 0). */
export function milestoneOf(metric: string, v: number): number {
  if (v <= 0) return 0;
  switch (metric) {
    case 'sum': // 합산 강화 — 1,000 단위
      return v >= 1_000 ? Math.floor(v / 1_000) * 1_000 : 0;
    case 'combat': {
      // 전투력 — 10만부터 10의 거듭제곱(10만·100만·1000만·1억…)
      if (v < 100_000) return 0;
      let m = 100_000;
      while (m * 10 <= v) m *= 10;
      return m;
    }
    case 'raid': // 레이드 처치 — 100회 단위
      return v >= 100 ? Math.floor(v / 100) * 100 : 0;
    case 'melee': // 대난투 통산 우승 — 10회 단위
      return v >= 10 ? Math.floor(v / 10) * 10 : 0;
    default:
      return 0;
  }
}

/** 전투력 축약 한글 표기 — 10만/100만/1000만/1억(딱 떨어질 때만, 아니면 로케일 숫자). */
function koreanCount(v: number): string {
  if (v >= 100_000_000 && v % 100_000_000 === 0) return `${v / 100_000_000}억`;
  if (v >= 10_000 && v % 10_000 === 0) return `${(v / 10_000).toLocaleString('ko-KR')}만`;
  return v.toLocaleString('ko-KR');
}

/** 피드 표시 라벨 — 월드/길드 로그 공용. */
export function milestoneLabel(metric: string, milestone: number): string {
  switch (metric) {
    case 'sum':
      return `합산 강화 +${milestone.toLocaleString('ko-KR')}`;
    case 'combat':
      return `전투력 ${koreanCount(milestone)}`;
    case 'raid':
      return `레이드 처치 ${milestone.toLocaleString('ko-KR')}회`;
    case 'melee':
      return `대난투 통산 우승 ${milestone}회`;
    default:
      return `${metric} ${milestone}`;
  }
}
