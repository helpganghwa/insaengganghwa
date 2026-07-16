/** 성장 카드 인용구 — 요일별 로테이션(일~토). 카드·OG 공용(순수 상수). */
export const TODAY_QUOTES = [
  '"쉬는 날에도 확률은 오른다"',
  '"오늘도 망치는 멈추지 않았다"',
  '"기다림도 강화의 일부다"',
  '"어제의 나보다 단단하게"',
  '"조급함은 하락의 지름길"',
  '"불꽃은 식지 않았다"',
  '"주말의 모루는 더 뜨겁다"',
] as const;

export function todayQuote(kstDay: string): string {
  // kstDay = 'YYYY-MM-DD' — UTC 정오 고정 파싱으로 요일 계산(타임존 무관 결정론).
  return TODAY_QUOTES[new Date(`${kstDay}T12:00:00Z`).getUTCDay()]!;
}
