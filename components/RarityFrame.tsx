import { transcendStyle } from '@/lib/game/equipment/transcend';

/**
 * 카드 4 모서리에 등급별 별(Star Trio) overlay.
 * 부모는 `position: relative` + overflow-hidden(rounded면) 필요.
 *
 * 등급 규칙(확정):
 *   +0 (none)         → null (overlay 없음, 부모 카드는 회색 기본 보더 유지)
 *   홀수 (sub=0)      → 큰 별만 (4 모서리 큰 별 1개씩)
 *   짝수 (sub=1)      → 큰 별 + 위성 별 3개 (4 모서리에 동일 세트, transform-flip)
 *
 * 보더 색: rarityBorderStyle() 헬퍼로 호출자가 카드 자체 border-color를 등급색
 * (큰 별과 동색)으로 설정. +0은 빈 객체 → 부모의 zinc-200/800 회색 유지.
 */

const CORNER_PCT = 30; // 코너 ornate 영역 — 카드의 30% × 30%

/** 좌상단 기준 ornate. subOne=true면 위성 별 3개 추가. 4 모서리는 transform-flip. */
function StarTrioOrnate({ color, accent, subOne }: { color: string; accent: string; subOne: boolean }) {
  return (
    <svg
      viewBox="0 0 30 30"
      preserveAspectRatio="none"
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      {/* 큰 별 (외각 R=4) — 모든 등급 공통. 코너에서 2px(viewBox 1.5단위) 안쪽 이동. */}
      <g transform="translate(7.5 7.5)" fill={color}>
        <polygon points="0,-4 1.1,-1.1 4,0 1.1,1.1 0,4 -1.1,1.1 -4,0 -1.1,-1.1" />
      </g>
      <circle cx="7.5" cy="7.5" r="1.1" fill="rgba(255,255,255,0.9)" />
      {/* 위성 별 3개 — 짝수 등급(sub=1)만. 큰 별과 같은 1.5 오프셋. */}
      {subOne ? (
        <>
          <g transform="translate(14.5 4.5)" fill={accent}>
            <polygon points="0,-2 0.55,-0.55 2,0 0.55,0.55 0,2 -0.55,0.55 -2,0 -0.55,-0.55" />
          </g>
          <g transform="translate(4.5 14.5)" fill={accent}>
            <polygon points="0,-2 0.55,-0.55 2,0 0.55,0.55 0,2 -0.55,0.55 -2,0 -0.55,-0.55" />
          </g>
          <g transform="translate(13.5 13.5)" fill={accent}>
            <polygon points="0,-1.6 0.45,-0.45 1.6,0 0.45,0.45 0,1.6 -0.45,0.45 -1.6,0 -0.45,-0.45" />
          </g>
        </>
      ) : null}
    </svg>
  );
}

export function RarityFrame({ level, className }: { level: number; className?: string }) {
  const st = transcendStyle(level);
  if (!st.hasFrame) return null;
  const [r, g, b] = st.colorRgb;
  const color = `rgb(${r},${g},${b})`;
  const accent = `rgb(${Math.round(r + (255 - r) * 0.45)},${Math.round(g + (255 - g) * 0.45)},${Math.round(b + (255 - b) * 0.45)})`;
  const subOne = st.sub === 1;
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
          <StarTrioOrnate color={color} accent={accent} subOne={subOne} />
        </div>
      ))}
    </div>
  );
}

/** 카드 보더에 적용할 inline style — hasFrame이면 등급색, 아니면 빈 객체. */
export function rarityBorderStyle(level: number): React.CSSProperties {
  const st = transcendStyle(level);
  if (!st.hasFrame) return {};
  const [r, g, b] = st.colorRgb;
  return { borderColor: `rgb(${r},${g},${b})` };
}

export function hasRarityBorder(level: number): boolean {
  return transcendStyle(level).hasFrame;
}
