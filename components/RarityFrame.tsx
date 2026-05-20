import { transcendStyle, TRANSCEND_TUNING } from '@/lib/game/equipment/transcend';

/**
 * 카드 4 모서리에 등급 ornate 장식을 얹는 absolute overlay.
 * 부모는 `position: relative` 필요.
 *
 * 설계:
 *   카드 보더는 기존(회색 zinc-200/800·border-2 두께) 그대로 두고, transcend-frame
 *   asset의 *모서리 부분만* CSS mask-position으로 잘라 4 코너에 등급색으로 그림.
 *   asset 전체(가운데 직선 ring 포함)를 그리지 않으므로 보더와 두께 충돌 없음.
 *
 *   sub=1(짝수 등급 +2/+4/+6/+8/+10)은 코너 ornate 위에 별 4개 추가.
 *   +0(none)은 null 반환 — 부모 카드의 기본 회색 보더만.
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

// 코너 영역 크기 — 카드 폭의 30%. 너무 크면 가운데 빈 영역으로 ring 형태가 보임.
// mask-size = 100% / 30% = 333.33% (frame 전체가 그 영역에 그려지고, 30% × 30% 부분만 보임)
const CORNER_PCT = 30;
const MASK_PCT = (100 / CORNER_PCT) * 100; // = 333.33%

const STAR_BOX = 8;
const STAR_INSET = 10;

export function RarityFrame({ level, className }: { level: number; className?: string }) {
  const st = transcendStyle(level);
  if (!st.hasFrame) return null;
  const [r, g, b] = st.colorRgb;
  const color = `rgb(${r},${g},${b})`;
  const starCol = `rgb(${Math.round(r + (255 - r) * 0.3)},${Math.round(g + (255 - g) * 0.3)},${Math.round(b + (255 - b) * 0.3)})`;

  const corners: { pos: React.CSSProperties; mask: string }[] = [
    { pos: { top: 0, left: 0 }, mask: '0% 0%' },
    { pos: { top: 0, right: 0 }, mask: '100% 0%' },
    { pos: { bottom: 0, left: 0 }, mask: '0% 100%' },
    { pos: { bottom: 0, right: 0 }, mask: '100% 100%' },
  ];

  return (
    <div
      aria-hidden
      className={className}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {/* (1) 4 모서리 — frame asset에서 corner 영역만 mask-position으로 잘라 등급색 */}
      {corners.map((c, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: `${CORNER_PCT}%`,
            height: `${CORNER_PCT}%`,
            ...c.pos,
            backgroundColor: color,
            WebkitMaskImage: `url(${TRANSCEND_TUNING.frameAsset})`,
            maskImage: `url(${TRANSCEND_TUNING.frameAsset})`,
            WebkitMaskSize: `${MASK_PCT}% ${MASK_PCT}%`,
            maskSize: `${MASK_PCT}% ${MASK_PCT}%`,
            WebkitMaskPosition: c.mask,
            maskPosition: c.mask,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
          }}
        />
      ))}
      {/* (2) sub=1(짝수 등급) — 별 4개 추가. 카드 모서리 안쪽, 작게. */}
      {st.sub === 1
        ? [
            { left: `${STAR_INSET}%`, top: `${STAR_INSET}%` },
            { right: `${STAR_INSET}%`, top: `${STAR_INSET}%` },
            { left: `${STAR_INSET}%`, bottom: `${STAR_INSET}%` },
            { right: `${STAR_INSET}%`, bottom: `${STAR_INSET}%` },
          ].map((p, i) => (
            <svg
              key={i}
              aria-hidden
              viewBox={`0 0 ${STAR_BOX} ${STAR_BOX}`}
              style={{ position: 'absolute', width: `${STAR_BOX}%`, height: `${STAR_BOX}%`, ...p }}
            >
              <polygon points={starPoints(STAR_BOX / 2)} fill={starCol} />
              <circle cx={STAR_BOX / 2} cy={STAR_BOX / 2} r={STAR_BOX * 0.09} fill="rgba(255,255,255,0.92)" />
            </svg>
          ))
        : null}
    </div>
  );
}
