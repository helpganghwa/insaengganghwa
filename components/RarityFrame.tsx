import { transcendStyle } from '@/lib/game/equipment/transcend';

/**
 * 카드 4 모서리에 등급 ornate 장식을 얹는 absolute overlay.
 * 부모는 `position: relative` (rounded면 overflow-hidden 권장) 필요.
 *
 * 디자인:
 *   카드 보더(회색 zinc-200/800, border-2)는 그대로 두고, 4 모서리에 등급색
 *   SVG ornate(좌상단 기준 모티프를 4방향으로 transform-flip)와 sub=1(짝수
 *   등급) 별을 overlay. ornate는 PNG asset이 아니라 SVG path — 카드 보더에
 *   자연스럽게 연결되도록 직접 그림.
 *
 *   ornate 요소:
 *     - 두 L 라인(가로/세로) — 카드 외곽 모서리에서 안쪽 길이 22% 두께 3%
 *     - 라인 끝 다이아몬드 — 라인 끝점 강조
 *     - 코너 안쪽 점 — 등급 식별 보조 액센트(밝은 색)
 *   sub=1(짝수 등급) 별은 코너 안쪽에 추가, 크기 6% (모서리에서 8% 안쪽).
 *
 *   +0(none)은 null 반환.
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

const CORNER_PCT = 30; // 코너 ornate 영역 — 카드의 30% × 30%
const STAR_BOX = 6; // 별 박스 (카드 폭의 6%)
const STAR_INSET = 8; // 별 좌상단 inset (% — 중심 ≈ 11%)

/** 좌상단 기준 코너 ornate. 다른 모서리는 부모 div의 transform-flip으로 회전. */
function CornerOrnate({ color, accent }: { color: string; accent: string }) {
  return (
    <svg
      viewBox="0 0 30 30"
      preserveAspectRatio="none"
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      {/* 가로 L 라인 — 카드 외곽 보더 자리 강조 */}
      <rect x="0" y="0" width="22" height="3" fill={color} />
      {/* 세로 L 라인 */}
      <rect x="0" y="0" width="3" height="22" fill={color} />
      {/* 가로 라인 끝 다이아몬드 */}
      <rect x="19.5" y="-1" width="4" height="4" fill={color} transform="rotate(45 21.5 1)" />
      {/* 세로 라인 끝 다이아몬드 */}
      <rect x="-1" y="19.5" width="4" height="4" fill={color} transform="rotate(45 1 21.5)" />
      {/* 코너 안쪽 액센트 점 */}
      <circle cx="7" cy="7" r="1.8" fill={accent} />
    </svg>
  );
}

export function RarityFrame({ level, className }: { level: number; className?: string }) {
  const st = transcendStyle(level);
  if (!st.hasFrame) return null;
  const [r, g, b] = st.colorRgb;
  const color = `rgb(${r},${g},${b})`;
  const accent = `rgb(${Math.round(r + (255 - r) * 0.45)},${Math.round(g + (255 - g) * 0.45)},${Math.round(b + (255 - b) * 0.45)})`;

  const corners: { pos: React.CSSProperties; transform: string }[] = [
    { pos: { top: 0, left: 0 }, transform: 'none' },
    { pos: { top: 0, right: 0 }, transform: 'scaleX(-1)' },
    { pos: { bottom: 0, left: 0 }, transform: 'scaleY(-1)' },
    { pos: { bottom: 0, right: 0 }, transform: 'scale(-1, -1)' },
  ];

  return (
    <div
      aria-hidden
      className={className}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {/* (1) 4 모서리 ornate — SVG로 직접 그림 */}
      {corners.map((c, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: `${CORNER_PCT}%`,
            height: `${CORNER_PCT}%`,
            transform: c.transform,
            ...c.pos,
          }}
        >
          <CornerOrnate color={color} accent={accent} />
        </div>
      ))}
      {/* (2) sub=1(짝수 등급) 별 — 코너 안쪽 추가 액센트 */}
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
              <polygon points={starPoints(STAR_BOX / 2)} fill={accent} />
              <circle cx={STAR_BOX / 2} cy={STAR_BOX / 2} r={STAR_BOX * 0.09} fill="rgba(255,255,255,0.92)" />
            </svg>
          ))
        : null}
    </div>
  );
}
