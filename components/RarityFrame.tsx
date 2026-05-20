import { transcendStyle } from '@/lib/game/equipment/transcend';

/**
 * 카드 보더에 등급 ornate 코너 장식을 얹는 absolute overlay.
 * 부모는 `position: relative` 필요.
 *
 * 디자인 결정:
 *   카드 보더 두께는 기존(border-2)을 유지하고 *색만* 등급색으로 흡수. 그 위에
 *   4 모서리 별(sub=1, 짝수 등급)만 overlay → 시각적으로 "코너 ornate가 보더 위에
 *   덧붙은" 형태. 두꺼운 frame mask ring을 그리지 않으므로 기존 보더 두께와의
 *   이질감 없음. 등급 정보는 (a) 카드 보더 색 (b) 짝수 등급의 별로 표현.
 *
 *  +0(none) → null 반환 (부모가 회색 기본 보더 유지)
 */
function starPoints(R: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 === 0 ? R : R * 0.4;
    const a = (i * 45 - 90) * (Math.PI / 180);
    pts.push(`${(R + Math.cos(a) * rr).toFixed(2)},${(R + Math.sin(a) * rr).toFixed(2)}`);
  }
  return pts.join(' ');
}

// 별 — 카드 영역 기준. 모서리에서 충분히 안쪽(중심 ≈ 카드 14% 위치).
const STAR_BOX = 8; // 카드 폭의 8% 별 박스
const STAR_INSET = 10; // 별 좌상단 inset (% — 별 중심이 카드 모서리에서 14% 안쪽)

/**
 * 등급 시각 표식(코너 별만). 카드 보더 *색*은 호출자가 등급색으로 별도 설정한다
 * (`useRarityBorder` 헬퍼 사용 권장).
 */
export function RarityFrame({ level, className }: { level: number; className?: string }) {
  const st = transcendStyle(level);
  // 별은 sub=1(짝수 등급)만. +0 / 홀수(sub=0)는 보더 색만으로 표현 → 이 컴포넌트 미렌더.
  if (!st.hasFrame || st.sub !== 1) return null;
  const [r, g, b] = st.colorRgb;
  const starCol = `rgb(${Math.round(r + (255 - r) * 0.3)},${Math.round(g + (255 - g) * 0.3)},${Math.round(b + (255 - b) * 0.3)})`;
  const corners: React.CSSProperties[] = [
    { left: `${STAR_INSET}%`, top: `${STAR_INSET}%` },
    { right: `${STAR_INSET}%`, top: `${STAR_INSET}%` },
    { left: `${STAR_INSET}%`, bottom: `${STAR_INSET}%` },
    { right: `${STAR_INSET}%`, bottom: `${STAR_INSET}%` },
  ];
  return (
    <div
      aria-hidden
      className={className}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {corners.map((c, i) => (
        <svg
          key={i}
          aria-hidden
          viewBox={`0 0 ${STAR_BOX} ${STAR_BOX}`}
          style={{ position: 'absolute', width: `${STAR_BOX}%`, height: `${STAR_BOX}%`, ...c }}
        >
          <polygon points={starPoints(STAR_BOX / 2)} fill={starCol} />
          <circle cx={STAR_BOX / 2} cy={STAR_BOX / 2} r={STAR_BOX * 0.09} fill="rgba(255,255,255,0.92)" />
        </svg>
      ))}
    </div>
  );
}

/**
 * 카드 보더에 적용할 inline style — hasFrame이면 등급색, 아니면 빈 객체(부모의
 * 기본 회색 border 유지). hasFrame과 함께 className에서 `border-2`는 유지하되
 * `border-zinc-200 dark:border-zinc-800`은 빼고 호출자가 조건부로 적용한다.
 */
export function rarityBorderStyle(level: number): React.CSSProperties {
  const st = transcendStyle(level);
  if (!st.hasFrame) return {};
  const [r, g, b] = st.colorRgb;
  return { borderColor: `rgb(${r},${g},${b})` };
}

export function hasRarityBorder(level: number): boolean {
  return transcendStyle(level).hasFrame;
}
