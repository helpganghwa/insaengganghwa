import { transcendStyle, TRANSCEND_TUNING } from '@/lib/game/equipment/transcend';

/**
 * 카드 보더로 등급 frame을 흡수하는 absolute overlay.
 * 부모 컨테이너는 `position: relative` + `aspect-square`(혹은 정사각) 필요.
 * Frame mask는 사각형 외곽 ring + 코너 ornate 형태(중앙은 투명) →
 * 부모 카드의 내용물(이미지·이름·레벨)을 가리지 않음.
 *
 * 사용 컨텍스트: 인벤토리·도감·강화소·가챠 결과 등 sprite + 메타가 있는 카드.
 * sprite는 frameless로 그려 시각 외곽선이 카드 보더(=등급 frame)에 단일화됨.
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

const STAR_BOX = 16; // viewBox 단위(%과 매칭 — 카드 폭의 16% 별)
const STAR_INSET = 3.5; // 별 박스 좌상 끝의 카드 가장자리 inset(% — 중심이 11.5%)

export function RarityFrame({
  level,
  className,
}: {
  /** transcend_level (0..MAX). +0이면 frame 없음(null 반환). */
  level: number;
  /** 부모는 반드시 position:relative. 이 컴포넌트는 부모 영역 전체를 absolute로 덮음. */
  className?: string;
}) {
  const st = transcendStyle(level);
  if (!st.hasFrame) return null;
  const [r, g, b] = st.colorRgb;
  const frameCol = `rgb(${r},${g},${b})`;
  const starCol = `rgb(${Math.round(r + (255 - r) * 0.3)},${Math.round(g + (255 - g) * 0.3)},${Math.round(b + (255 - b) * 0.3)})`;
  const corners: { style: React.CSSProperties }[] = [
    { style: { left: `${STAR_INSET}%`, top: `${STAR_INSET}%` } },
    { style: { right: `${STAR_INSET}%`, top: `${STAR_INSET}%` } },
    { style: { left: `${STAR_INSET}%`, bottom: `${STAR_INSET}%` } },
    { style: { right: `${STAR_INSET}%`, bottom: `${STAR_INSET}%` } },
  ];
  return (
    <div
      aria-hidden
      className={className}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {/* Frame 본체 — 등급색 배경을 frame mask로 사각형 외곽 ring + 코너 ornate로 클립 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: frameCol,
          WebkitMaskImage: `url(${TRANSCEND_TUNING.frameAsset})`,
          maskImage: `url(${TRANSCEND_TUNING.frameAsset})`,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
        }}
      />
      {/* II(짝수 등급)는 카드 4 모서리에 별. sub=0은 frame만. */}
      {st.sub === 1
        ? corners.map((c, i) => (
            <svg
              key={i}
              aria-hidden
              viewBox={`0 0 ${STAR_BOX} ${STAR_BOX}`}
              style={{
                position: 'absolute',
                width: `${STAR_BOX}%`,
                height: `${STAR_BOX}%`,
                ...c.style,
              }}
            >
              <polygon points={starPoints(STAR_BOX / 2)} fill={starCol} />
              <circle cx={STAR_BOX / 2} cy={STAR_BOX / 2} r={STAR_BOX * 0.09} fill="rgba(255,255,255,0.92)" />
            </svg>
          ))
        : null}
    </div>
  );
}
