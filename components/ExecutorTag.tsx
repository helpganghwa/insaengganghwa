/**
 * 집행관 표시 — "구역명 집행관". 구역명은 세계지도 지역색, '집행관'은 인디고 고정.
 * 헤더·채팅·내 정보에서 공용(2026-07-22). 집행관이 아니면(zone 없음) 미표시(null).
 *
 * ⚠ 항상 shrink-0 — 좁은 곳(헤더)에서 옆 닉네임이 먼저 말줄임되고 집행관은 잘리지 않게.
 */

/** 지역색 — 월드맵 노드(WorldMapView REGION)와 일치. 미매칭이면 인디고 폴백. */
export const REGION_COLOR: Record<string, string> = {
  volcano: '#ef4444',
  temple: '#60a5fa',
  swamp: '#22c55e',
  orc: '#f97316',
  kingdom: '#fbbf24',
  angel: '#c084fc',
};

export function ExecutorTag({
  zone,
  region,
  className = '',
}: {
  zone: string | null | undefined;
  region: string | null | undefined;
  /** 폰트 크기 등 표시 컨텍스트별 클래스(크기는 호출부가 지정). */
  className?: string;
}) {
  if (!zone) return null;
  return (
    <span className={`shrink-0 whitespace-nowrap ${className}`}>
      <span style={{ color: REGION_COLOR[region ?? ''] ?? '#a5b4fc' }}>{zone}</span>{' '}
      <span className="text-indigo-500 dark:text-indigo-300">집행관</span>
    </span>
  );
}
